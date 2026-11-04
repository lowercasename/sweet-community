// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { FakeEventSource, ROOT, group, member, post, renderWithQuery, user } from '../test-utils'

/**
 * Two guards. The draft bug: closing and reopening a pane, or visiting
 * Settings and coming back, must not remount posts or chat; a remount would
 * fetch their first page again, so one fetch each is the assertion.
 * The avatar bug: a person's picture is shown from the users cache, so a
 * change arriving on the stream redraws it on their posts and in the nav.
 */
vi.mock('../api', () => ({
  getPosts: vi.fn(),
  getMessages: vi.fn(() => Promise.resolve({ messages: [], next_before: null })),
  listUsers: vi.fn(),
  listGroups: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
}))

const raphael = user('raphael')

afterEach(cleanup)

beforeEach(async () => {
  const { getPosts, listUsers, listGroups } = await import('../api')
  vi.mocked(getPosts).mockResolvedValue({ posts: [post('p1', raphael)], next_before: null })
  vi.mocked(listUsers).mockResolvedValue({ users: [member('raphael', 'owner')] })
  vi.mocked(listGroups).mockResolvedValue({ groups: [group(ROOT, 'owner')] })
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('ok'))),
  )
  localStorage.setItem('sweet.layout', 'both')
})

async function home() {
  const { Home } = await import('./Home')
  const result = renderWithQuery(<Home me={raphael} onSignOut={() => {}} />)
  await screen.findByText('p1')
  await screen.findByText('Nobody has said anything yet. Say hello.')
  return result
}

describe('Home', () => {
  it('shows the root group and fetches its feed and room once each', async () => {
    const { getPosts, getMessages } = await import('../api')
    await home()
    expect(getPosts).toHaveBeenCalledWith(ROOT, null)
    expect(getMessages).toHaveBeenCalledWith(ROOT, null)
  })

  it('keeps posts and chat mounted across pane and page changes', async () => {
    const { getPosts, getMessages } = await import('../api')
    const { container } = await home()
    const editors = () => container.querySelectorAll('.ProseMirror').length
    expect(editors()).toBe(2)

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' })
    expect(screen.queryByRole('separator')).toBeNull()
    expect(editors()).toBe(2)
    fireEvent.click(screen.getByTitle('Show chat'))
    expect(screen.getByRole('separator')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' })
    fireEvent.click(screen.getByTitle('Show posts'))

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await screen.findByText('Profile picture')
    expect(editors()).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('separator')).toBeTruthy()

    expect(editors()).toBe(2)
    expect(getPosts).toHaveBeenCalledTimes(1)
    expect(getMessages).toHaveBeenCalledTimes(1)
  })

  it('shows a changed picture on posts and in the nav as soon as the stream says so', async () => {
    await home()
    const article = screen.getByText('p1').closest('article')!
    const postAvatar = () => within(article).getByRole('img', { name: 'raphael' }).getAttribute('src')
    const navAvatar = () =>
      within(screen.getByRole('navigation')).getByRole('img', { name: 'raphael' }).getAttribute('src')
    expect(postAvatar()).not.toContain('/img/')
    expect(navAvatar()).not.toContain('/img/')

    FakeEventSource.last!.emit('user', user('raphael', '/img/new-face'), 7)

    await vi.waitFor(() => expect(postAvatar()).toBe('/img/new-face'))
    expect(navAvatar()).toBe('/img/new-face')
  })
})
