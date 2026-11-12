// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { marker, post, renderWithQuery, ROOT, user } from '../test-utils'
import type { Marker, User } from '../api'
import { keys } from './keys'
import { applyEvent } from './apply'

/**
 * Signing out must update the component that queried the signed-in user.
 * Clearing the cache while an observer is mounted leaves the observer holding
 * the removed query and its old data.
 */
vi.mock('../api', () => ({
  getMe: vi.fn(() => Promise.resolve(user('kit'))),
  logout: vi.fn(() => Promise.resolve()),
  getPost: vi.fn(),
  setMarker: vi.fn(),
  setUsername: vi.fn(),
  setPicture: vi.fn(),
}))

afterEach(cleanup)

it.each([true, false])('keeps the server count until a read request finishes with success=%s', async (success) => {
  const { setMarker } = await import('../api')
  const { useMarkRead } = await import('./hooks')
  let resolve!: (value: Marker) => void
  let reject!: (error: Error) => void
  vi.mocked(setMarker).mockImplementationOnce(
    () =>
      new Promise((yes, no) => {
        resolve = yes
        reject = no
      }),
  )
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  function Read() {
    const markRead = useMarkRead()
    return <button onClick={() => markRead(`chat:${ROOT}`, 20)}>Read</button>
  }
  const old = marker(`chat:${ROOT}`, 10, 3)
  const { qc } = renderWithQuery(<Read />, (qc) => qc.setQueryData(keys.markers, { markers: [old] }))
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(qc.getQueryData(keys.markers)).toEqual({ markers: [old] })
    const newer = marker(`chat:${ROOT}`, 20, 2)
    await act(async () => {
      if (success) resolve(newer)
      else reject(new Error('Offline'))
    })
    expect(qc.getQueryData(keys.markers)).toEqual({ markers: [success ? newer : old] })
  } finally {
    log.mockRestore()
  }
})

it('does not restore a feed snapshot while a post refreshes after an identity change', async () => {
  const { getPost } = await import('../api')
  const { usePost } = await import('./hooks')
  const old = post('p1', user('mo'))
  vi.mocked(getPost)
    .mockResolvedValueOnce(old)
    .mockImplementationOnce(() => new Promise(() => {}))
  function Preview() {
    const { post } = usePost('p1')
    return <p>{post?.author.username ?? 'Loading'}</p>
  }
  const { qc } = renderWithQuery(<Preview />, (qc) => {
    qc.setQueryData(keys.posts(ROOT), { pages: [{ posts: [old], next_before: null }], pageParams: [null] })
  })
  await screen.findByText('mo')
  await vi.waitFor(() => expect(getPost).toHaveBeenCalledTimes(1))
  act(() => applyEvent(qc, 'membership_delete', { group_id: ROOT, user_id: old.author.id }))
  await screen.findByText('Loading')
  expect(screen.queryByText('mo')).toBeNull()
})

describe('useSession', () => {
  it('signing out updates the observer of the signed-in user to null', async () => {
    const { useMe, useSession } = await import('./hooks')
    function Who() {
      const { data: me, isPending } = useMe()
      const { signOut } = useSession()
      if (isPending) return <p>loading</p>
      return me ? <button onClick={() => void signOut()}>out {me.username}</button> : <p>anonymous</p>
    }
    renderWithQuery(<Who />)
    fireEvent.click(await screen.findByRole('button', { name: 'out kit' }))
    await screen.findByText('anonymous')
  })
})

it.each(['username', 'picture'])('a delayed %s save cannot restore an older identity', async (kind) => {
  const { getMe, setUsername, setPicture } = await import('../api')
  const { useMe, useSetUsername, useSetPicture } = await import('./hooks')
  let finishSave!: (value: User) => void
  const save = kind === 'username' ? setUsername : setPicture
  vi.mocked(save).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSave = resolve
      }),
  )
  const old = user('kit')
  const latest = { ...old, username: 'newest', picture: '/img/newest' }
  vi.mocked(getMe).mockResolvedValue(latest)
  function Account() {
    const { data: me } = useMe()
    const rename = useSetUsername()
    const picture = useSetPicture()
    return (
      <button onClick={() => void (kind === 'username' ? rename('older') : picture('older'))}>{me?.username}</button>
    )
  }
  const { qc } = renderWithQuery(<Account />, (qc) => qc.setQueryData(keys.me, old))
  fireEvent.click(screen.getByRole('button', { name: 'kit' }))
  await act(async () => {
    applyEvent(qc, 'user', latest)
    finishSave({ ...old, username: 'older', picture: '/img/older' })
  })
  await vi.waitFor(() => expect(qc.getQueryData(keys.me)).toEqual(latest))
})
