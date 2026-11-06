// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { FakeEventSource, ROOT, dm, group, member, notification, post, renderWithQuery, user } from '../test-utils'
import { ApiError } from '../api'

/**
 * Guards on the signed-in page. The draft bug: closing and reopening a
 * pane, or visiting Settings and coming back, must not remount posts or
 * chat; a remount would fetch their first page again, so one fetch each is
 * the assertion. The avatar bug: a person's picture is shown from the users
 * cache, so a change arriving on the stream redraws it everywhere. And
 * groups: the nav lists mine, a group opens with the panes its mode says,
 * a DM is named by its people, and New room follows the root's flag.
 */
vi.mock('../api', async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import('../api')>()).ApiError,
  getMe: vi.fn(() => Promise.resolve({ id: 'raphael', username: 'raphael', picture: null })),
  getPosts: vi.fn(),
  getPost: vi.fn(),
  getComments: vi.fn(() => Promise.resolve({ comments: [] })),
  getMessages: vi.fn(() => Promise.resolve({ messages: [], next_before: null })),
  listUsers: vi.fn(),
  listGroups: vi.fn(),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listInvites: vi.fn(() => Promise.resolve({ invites: [] })),
  getSettings: vi.fn(() => Promise.resolve({ group_creation: 'anyone' })),
  listNotifications: vi.fn(() => Promise.resolve({ notifications: [], next_before: null })),
  listMarkers: vi.fn(() =>
    Promise.resolve({ markers: [{ user_id: 'raphael', stream: 'notifications', read_at: 0, unread: 0 }] }),
  ),
  setMarker: vi.fn((stream: string, readAt: number) =>
    Promise.resolve({ user_id: 'raphael', stream, read_at: readAt }),
  ),
  setSettings: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
}))

const raphael = user('raphael')
const kit = user('kit')

afterEach(cleanup)

beforeEach(async () => {
  const { getPosts, listUsers, listGroups } = await import('../api')
  vi.mocked(getPosts).mockImplementation((gid) =>
    Promise.resolve({
      posts: gid === ROOT ? [post('p1', raphael)] : [post('g1', kit, { group_id: gid })],
      next_before: null,
    }),
  )
  vi.mocked(listUsers).mockResolvedValue({ users: [member('raphael', 'owner'), member('kit')] })
  vi.mocked(listGroups).mockResolvedValue({
    groups: [
      group(ROOT, 'owner'),
      group('knit', 'member', { name: 'Knitting', mode: 'chat' }),
      dm('d1', [kit, raphael]),
    ],
  })
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('ok'))),
  )
  localStorage.setItem('sweet.layout', 'both')
})

async function home(path = '/') {
  window.history.replaceState(null, '', path)
  const { Home } = await import('./Home')
  const result = renderWithQuery(<Home me={raphael} onSignOut={() => {}} />)
  if (path === '/') {
    await screen.findByText('p1')
    await screen.findByText('Nobody has said anything yet. Say hello.')
  }
  return result
}

const nav = () => within(screen.getByRole('navigation'))

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
    fireEvent.click(screen.getByRole('button', { name: 'Show chat' }))
    expect(screen.getByRole('separator')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' })
    fireEvent.click(screen.getByRole('button', { name: 'Show posts' }))

    fireEvent.click(nav().getByRole('button', { name: 'Settings' }))
    await screen.findByText('Profile picture')
    expect(window.location.pathname).toBe('/settings')
    expect(editors()).toBe(2)
    // Mounted, but out of sight: another page is showing.
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).not.toBeNull()
    fireEvent.click(nav().getByRole('button', { name: 'Home' }))
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('separator')).toBeTruthy()

    expect(editors()).toBe(2)
    expect(getPosts).toHaveBeenCalledTimes(1)
    expect(getMessages).toHaveBeenCalledTimes(1)
  })

  it('shows a changed picture on posts and in the nav as soon as the stream says so', async () => {
    await home()
    const article = screen.getByText('p1').closest('article')!
    const postAvatar = () => within(article).getByRole('img', { name: 'raphael' }).getAttribute('src')
    const navAvatar = () => nav().getByRole('img', { name: 'raphael' }).getAttribute('src')
    expect(postAvatar()).not.toContain('/img/')
    expect(navAvatar()).not.toContain('/img/')

    FakeEventSource.last!.emit('user', user('raphael', '/img/new-face'), 7)

    await vi.waitFor(() => expect(postAvatar()).toBe('/img/new-face'))
    expect(navAvatar()).toBe('/img/new-face')
  })

  it('lists my rooms and conversations in the nav, and opens a chat-only room with one pane', async () => {
    const { getMessages } = await import('../api')
    const { container } = await home()
    expect(nav().getByRole('button', { name: 'Knitting' })).toBeTruthy()
    expect(nav().getByRole('button', { name: 'kit' })).toBeTruthy()
    expect(nav().getByRole('button', { name: 'All messages' })).toBeTruthy()
    expect(nav().getByRole('button', { name: 'New room' })).toBeTruthy()

    fireEvent.click(nav().getByRole('button', { name: 'Knitting' }))
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('knit', null))
    expect(window.location.pathname).toBe('/r/knit')
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).toBeNull()
    // Chat only: no divider, no posts editor; the group's name and its Members control are shown.
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Knitting' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Members and settings' })).toBeTruthy()
    expect(container.querySelectorAll('.ProseMirror').length).toBe(1)
    // Members shows alone: the group's view is still mounted but out of sight.
    fireEvent.click(screen.getByRole('button', { name: 'Members and settings' }))
    await screen.findByRole('heading', { name: 'Members' })
    expect(window.location.pathname).toBe('/r/knit/members')
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).not.toBeNull()
    // The group's bar stays, with its name and a way back; Members is no longer offered there.
    expect(screen.getByRole('heading', { name: 'Knitting' }).closest('.hidden')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Members and settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Knitting' }))
    expect(window.location.pathname).toBe('/r/knit')
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).toBeNull()
  })

  it('All messages lists my conversations; one opens like a room and is marked in the nav', async () => {
    const { getMessages } = await import('../api')
    const { container } = await home()
    fireEvent.click(nav().getByRole('button', { name: 'All messages' }))
    expect(window.location.pathname).toBe('/messages')
    await screen.findByRole('heading', { name: 'Messages' })
    expect(nav().getByRole('button', { name: 'All messages' }).getAttribute('aria-current')).toBe('page')
    // The feed and room stay mounted behind the page.
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).not.toBeNull()

    fireEvent.click(within(screen.getByRole('list')).getByRole('button', { name: 'kit' }))
    expect(window.location.pathname).toBe('/r/d1')
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('d1', null))
    // The bar is a title: its names are text, not cards.
    expect(within(screen.getByRole('heading', { name: 'kit' })).queryByRole('button')).toBeNull()
    expect(nav().getByRole('button', { name: 'kit' }).getAttribute('aria-current')).toBe('page')
    expect(nav().getByRole('button', { name: 'All messages' }).getAttribute('aria-current')).toBeNull()
    expect(nav().getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBeNull()
  })

  it('opens whatever page the URL names, and the back button returns', async () => {
    const { getMessages } = await import('../api')
    await home('/r/knit/members')
    await screen.findByRole('heading', { name: 'Members' })
    expect(screen.getByRole('heading', { name: 'Knitting' }).closest('.hidden')).toBeNull()
    // The group named by the URL is the one mounted behind the page.
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('knit', null))
    expect(getMessages).not.toHaveBeenCalledWith(ROOT, null)

    fireEvent.click(nav().getByRole('button', { name: 'People' }))
    await screen.findByRole('heading', { name: 'People' })
    expect(window.location.pathname).toBe('/people')
    window.history.back()
    await screen.findByRole('heading', { name: 'Members' })
    expect(window.location.pathname).toBe('/r/knit/members')
  })

  it('shows the root group for a path it does not know', async () => {
    await home('/nowhere')
    await screen.findByText('p1')
    expect(window.location.pathname).toBe('/')
  })

  it('a post has a page of its own: its time links there, the thread is open, Back returns to its room', async () => {
    const { getPost } = await import('../api')
    vi.mocked(getPost).mockResolvedValue(post('p1', raphael))
    await home()
    fireEvent.click(within(screen.getByText('p1').closest('article')!).getByRole('link'))
    expect(window.location.pathname).toBe('/p/p1')
    await screen.findByRole('heading', { name: 'Post by raphael' })
    // The feed stays mounted behind; the page's own copy of the post shows, with its reply editor.
    const shown = screen.getAllByRole('article').filter((a) => !a.closest('.hidden'))
    expect(shown).toHaveLength(1)
    expect(shown[0].querySelector('.editor-line')).not.toBeNull()
    expect(within(shown[0]).queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }))
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('separator')).toBeTruthy()
  })

  it('opens a post by its address, with its room behind it', async () => {
    const { getPost, getMessages } = await import('../api')
    vi.mocked(getPost).mockResolvedValue(post('g1', kit, { group_id: 'knit' }))
    await home('/p/g1')
    await screen.findByRole('heading', { name: 'Post by kit' })
    expect(getPost).toHaveBeenCalledWith('g1')
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('knit', null))
    fireEvent.click(screen.getByRole('button', { name: 'Back to Knitting' }))
    expect(window.location.pathname).toBe('/r/knit')
  })

  it('says so when a post is gone or not mine to see', async () => {
    const { getPost } = await import('../api')
    vi.mocked(getPost).mockRejectedValue(new ApiError(404, 'no such post'))
    await home('/p/nothing')
    await screen.findByText(/This post is gone/)
    fireEvent.click(screen.getAllByRole('button', { name: 'Home' }).find((b) => !b.closest('nav'))!)
    expect(window.location.pathname).toBe('/')
  })

  it('a notification on the stream lights the bell; the Notifications page puts it out', async () => {
    const { setMarker, listNotifications } = await import('../api')
    await home()
    expect(nav().getByRole('button', { name: 'Notifications' })).toBeTruthy()
    // The list is not loaded until the page asks for it; the stream counts it on my marker meanwhile.
    const fresh = notification('n5', 'comment', kit, { post_id: 'p1' })
    vi.mocked(listNotifications).mockResolvedValue({ notifications: [fresh], next_before: null })
    FakeEventSource.last!.emit('notification', fresh, 8)
    const bell = await nav().findByRole('button', { name: 'Notifications, unread' })
    fireEvent.click(bell)
    expect(window.location.pathname).toBe('/notifications')
    await screen.findByRole('heading', { name: 'Notifications' })
    await screen.findByRole('button', { name: 'kit commented on your post, new' })
    await vi.waitFor(() => expect(setMarker).toHaveBeenCalledWith('notifications', 5))
    await nav().findByRole('button', { name: 'Notifications' })
    expect(nav().getByRole('button', { name: 'Notifications' }).getAttribute('aria-current')).toBe('page')
  })

  it('hides New room when the root group says I may not', async () => {
    const { listGroups } = await import('../api')
    vi.mocked(listGroups).mockResolvedValue({
      groups: [group(ROOT, 'member', { can: { ...group(ROOT, 'member').can, create_groups: false } })],
    })
    await home()
    expect(nav().queryByRole('button', { name: 'New room' })).toBeNull()
  })
})
