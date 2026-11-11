// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { post, renderWithQuery, ROOT, user } from '../test-utils'
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
}))

afterEach(cleanup)

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
  act(() => applyEvent(qc, 'user', { ...old.author, username: 'removed-account' }))
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
