// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { FakeEventSource, ROOT, dm, group, member, notification, post, renderWithQuery, user } from '../test-utils'
import { ApiError } from '../api'

/**
 * Regression tests for the signed-in page.
 *
 * The draft bug. Closing and reopening a pane, or visiting Settings and
 * coming back, must not remount posts or chat. A remount would fetch their
 * first page again, so the tests assert one fetch each.
 *
 * The avatar bug. A user's picture is read from the users cache, so a change
 * that arrives on the stream updates it everywhere.
 *
 * Groups. The nav lists my groups, a group opens with the panes its mode
 * sets, a DM is named after its members, and New room follows the root
 * group's flag.
 */
vi.mock('../api', async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import('../api')>()).ApiError,
  getMe: vi.fn(() => Promise.resolve({ id: 'raphael', username: 'raphael', picture: null })),
  getPosts: vi.fn(),
  getPost: vi.fn(),
  getProfile: vi.fn(),
  getUserPosts: vi.fn(() => Promise.resolve({ posts: [], next_before: null })),
  getComments: vi.fn(() => Promise.resolve({ comments: [] })),
  getMessages: vi.fn(() => Promise.resolve({ messages: [], next_before: null })),
  listTopics: vi.fn(() => Promise.resolve({ topics: [] })),
  listUsers: vi.fn(),
  listGroups: vi.fn(),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listInvites: vi.fn(() => Promise.resolve({ invites: [] })),
  getSettings: vi.fn(() => Promise.resolve({ group_creation: 'anyone' })),
  getAccount: vi.fn(() => Promise.resolve({ email: null, email_verified: false, pending_email: null })),
  getMySettings: vi.fn(() => Promise.resolve({ digest: 'weekly' })),
  setMySettings: vi.fn(),
  getPushKey: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
  listNotifications: vi.fn(() => Promise.resolve({ notifications: [], next_before: null })),
  listMarkers: vi.fn(() =>
    Promise.resolve({ markers: [{ user_id: 'raphael', stream: 'notifications', read_at: 0, unread: 0 }] }),
  ),
  setMarker: vi.fn((stream: string, readAt: number) =>
    Promise.resolve({ user_id: 'raphael', stream, read_at: readAt }),
  ),
  setSettings: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
  readNotification: vi.fn(),
  search: vi.fn(() => Promise.resolve({ hits: [] })),
  removeMember: vi.fn(),
}))

const raphael = user('raphael')
const kit = user('kit')

afterEach(cleanup)

beforeEach(async () => {
  const { getPosts, listUsers, listGroups, getProfile } = await import('../api')
  vi.mocked(getProfile).mockImplementation((name) =>
    Promise.resolve({
      ...user(name),
      role: 'owner' as const,
      joined_at: 1,
      bio_html: '',
      can: { edit: name === 'raphael' },
    }),
  )
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
  localStorage.setItem('sweet.nav', 'expanded')
})

async function home(path = '/') {
  window.history.replaceState(null, '', path)
  const { Home } = await import('./Home')
  // The app puts the current user in the cache before Home mounts. The stream's events about the current user
  // depend on it.
  const result = renderWithQuery(<Home me={raphael} onSignOut={() => {}} />, (qc) => qc.setQueryData(['me'], raphael))
  if (path === '/') {
    await screen.findByText('p1')
    await screen.findByText('Nobody has said anything yet. Say hello.')
  }
  return result
}

const nav = () => within(screen.getByRole('navigation'))

describe('Home', () => {
  it('shows the root group and fetches its posts and its messages once each', async () => {
    const { getPosts, getMessages } = await import('../api')
    await home()
    expect(getPosts).toHaveBeenCalledWith(ROOT, null, 20, null)
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

    fireEvent.click(nav().getByRole('button', { name: 'raphael' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    await screen.findByText('Profile picture')
    expect(window.location.pathname).toBe('/settings')
    expect(editors()).toBe(2)
    // The editors are still mounted but hidden, because another page is showing.
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).not.toBeNull()
    fireEvent.click(nav().getByRole('button', { name: 'Home' }))
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('separator')).toBeTruthy()

    expect(editors()).toBe(2)
    expect(getPosts).toHaveBeenCalledTimes(1)
    expect(getMessages).toHaveBeenCalledTimes(1)
  })

  it('shows a changed picture on posts and in the nav as soon as the stream sends the change', async () => {
    await home()
    const article = screen.getByText('p1').closest('article')!
    const postAvatar = () => within(article).getByRole('img', { name: 'raphael' }).getAttribute('src')
    // The profile picture in the nav is decorative (the row's name identifies the user). Its src is what to check.
    const navAvatar = () => nav().getByRole('button', { name: 'raphael' }).querySelector('img')!.getAttribute('src')
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
    // There is one conversation, so there is no All messages button. The section already shows every conversation.
    expect(nav().queryByRole('button', { name: 'All messages' })).toBeNull()
    expect(nav().getByRole('button', { name: 'New room' })).toBeTruthy()

    fireEvent.click(nav().getByRole('button', { name: 'Knitting' }))
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('knit', null))
    expect(window.location.pathname).toBe('/r/knit')
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).toBeNull()
    // The group is chat only. There is no divider and no post editor. The group's name and its Members button are
    // shown.
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Knitting' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Members and settings' })).toBeTruthy()
    expect(container.querySelectorAll('.ProseMirror').length).toBe(1)
    // The members page is shown by itself. The group's view is still mounted but hidden.
    fireEvent.click(screen.getByRole('button', { name: 'Members and settings' }))
    await screen.findByRole('heading', { name: 'Members' })
    expect(window.location.pathname).toBe('/r/knit/members')
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).not.toBeNull()
    // The group's bar is still shown, with its name and a back button. The Members button is no longer in the bar.
    expect(screen.getByRole('heading', { name: 'Knitting' }).closest('.hidden')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Members and settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Knitting' }))
    expect(window.location.pathname).toBe('/r/knit')
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).toBeNull()
  })

  it('the Messages page lists my conversations, and a conversation opens like a room and is marked as current in the nav', async () => {
    const { getMessages } = await import('../api')
    const { container } = await home('/messages')
    expect(window.location.pathname).toBe('/messages')
    await screen.findByRole('heading', { name: 'Messages' })
    // The posts and chat panes stay mounted behind the page.
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).not.toBeNull()

    fireEvent.click(within(screen.getByRole('list')).getByRole('button', { name: 'kit' }))
    expect(window.location.pathname).toBe('/r/d1')
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('d1', null))
    // The bar is a title. The names in it are text, not buttons that open profile cards.
    expect(within(screen.getByRole('heading', { name: 'kit' })).queryByRole('button')).toBeNull()
    expect(nav().getByRole('button', { name: 'kit' }).getAttribute('aria-current')).toBe('page')
    expect(nav().getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBeNull()
  })

  it("a conversation's bar has no people button, only a menu with Hide, and the conversation has no members page", async () => {
    const { removeMember } = await import('../api')
    vi.mocked(removeMember).mockResolvedValue({
      group_id: 'd1',
      user: raphael,
      role: 'member',
      joined_at: 1,
      hidden_at: 9,
    })
    await home('/r/d1/members')
    await vi.waitFor(() => expect(window.location.pathname).toBe('/r/d1'))
    await screen.findByRole('heading', { name: 'kit' })
    expect(screen.queryByRole('button', { name: 'Members and settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide conversation' }))
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(within(dialog).getByText('Hide this conversation?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide' }))
    expect(removeMember).toHaveBeenCalledWith('d1', 'raphael')
    await vi.waitFor(() => expect(window.location.pathname).toBe('/messages'))
    expect(nav().queryByRole('button', { name: 'kit' })).toBeNull()
  })

  it('opens the page that the URL names, and the back button returns to the previous page', async () => {
    const { getMessages } = await import('../api')
    await home('/r/knit/members')
    await screen.findByRole('heading', { name: 'Members' })
    expect(screen.getByRole('heading', { name: 'Knitting' }).closest('.hidden')).toBeNull()
    // The group in the URL is the group mounted behind the page.
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

  it('a post has its own page, its timestamp links to it, the thread is open, and Back returns to its room', async () => {
    const { getPost } = await import('../api')
    vi.mocked(getPost).mockResolvedValue(post('p1', raphael))
    await home()
    fireEvent.click(within(screen.getByText('p1').closest('article')!).getByRole('link'))
    expect(window.location.pathname).toBe('/p/p1')
    await screen.findByRole('heading', { name: 'Post by raphael' })
    // The feed stays mounted behind the page. The page shows its own copy of the post, with its reply editor.
    const shown = screen.getAllByRole('article').filter((a) => !a.closest('.hidden'))
    expect(shown).toHaveLength(1)
    expect(shown[0].querySelector('.editor-line')).not.toBeNull()
    expect(within(shown[0]).queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }))
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('separator')).toBeTruthy()
  })

  it('opens a post by its URL, with its room mounted behind it', async () => {
    const { getPost, getMessages } = await import('../api')
    vi.mocked(getPost).mockResolvedValue(post('g1', kit, { group_id: 'knit' }))
    await home('/p/g1')
    await screen.findByRole('heading', { name: 'Post by kit' })
    expect(getPost).toHaveBeenCalledWith('g1')
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('knit', null))
    fireEvent.click(screen.getByRole('button', { name: 'Back to Knitting' }))
    expect(window.location.pathname).toBe('/r/knit')
  })

  it('shows a message when a post is deleted or I may not see it', async () => {
    const { getPost } = await import('../api')
    vi.mocked(getPost).mockRejectedValue(new ApiError(404, 'no such post'))
    await home('/p/nothing')
    await screen.findByText(/This post has been deleted/)
    fireEvent.click(screen.getAllByRole('button', { name: 'Home' }).find((b) => !b.closest('nav'))!)
    expect(window.location.pathname).toBe('/')
  })

  it('a notification from the stream puts a dot on the notifications button, the notifications page keeps it, and opening the notification removes it', async () => {
    const { readNotification, listNotifications } = await import('../api')
    await home()
    expect(nav().getByRole('button', { name: 'Notifications' })).toBeTruthy()
    // The list is not loaded until the page requests it. Until then, the stream event increments the unread count on
    // my marker.
    const fresh = notification('n5', 'comment', kit, { post_id: 'p1' })
    vi.mocked(listNotifications).mockResolvedValue({ notifications: [fresh], next_before: null })
    vi.mocked(readNotification).mockResolvedValue({ ...fresh, read_at: 9 })
    FakeEventSource.last!.emit('notification', fresh, 8)
    const bell = await nav().findByRole('button', { name: 'Notifications, unread' })
    fireEvent.click(bell)
    expect(window.location.pathname).toBe('/notifications')
    await screen.findByRole('heading', { name: 'Notifications' })
    const row = await screen.findByRole('button', { name: 'kit commented on your post, new' })
    expect(nav().getByRole('button', { name: 'Notifications, unread' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(row)
    expect(readNotification).toHaveBeenCalledWith('n5')
    expect(window.location.pathname).toBe('/p/p1')
    await nav().findByRole('button', { name: 'Notifications' })
  })

  it("a collapsed pane's rail shows the dot for that pane's stream, and opening the pane marks it read immediately", async () => {
    await home()
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' })
    expect(screen.getByRole('button', { name: 'Show posts' })).toBeTruthy()
    FakeEventSource.last!.emit('post', post('p9', kit, { created_at: 99 }), 9)
    await screen.findByRole('button', { name: 'Show posts, unread' })
    fireEvent.click(screen.getByRole('button', { name: 'Show posts, unread' }))
    await screen.findByRole('separator')
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' })
    await screen.findByRole('button', { name: 'Show posts' })
    expect(screen.queryByRole('button', { name: 'Show posts, unread' })).toBeNull()
  })

  it('hides New room when the root group does not allow me to create rooms', async () => {
    const { listGroups } = await import('../api')
    vi.mocked(listGroups).mockResolvedValue({
      groups: [group(ROOT, 'member', { can: { ...group(ROOT, 'member').can, create_groups: false } })],
    })
    await home()
    expect(nav().queryByRole('button', { name: 'New room' })).toBeNull()
  })
})
