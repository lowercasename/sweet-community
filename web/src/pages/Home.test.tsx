// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { FakeEventSource, ROOT, dm, group, member, post, renderWithQuery, user } from '../test-utils'

/**
 * Guards on the signed-in page. The draft bug: closing and reopening a
 * pane, or visiting Settings and coming back, must not remount posts or
 * chat; a remount would fetch their first page again, so one fetch each is
 * the assertion. The avatar bug: a person's picture is shown from the users
 * cache, so a change arriving on the stream redraws it everywhere. And
 * groups: the nav lists mine, a group opens with the panes its mode says,
 * a DM is named by its people, and New group follows the root's flag.
 */
vi.mock('../api', () => ({
  getPosts: vi.fn(),
  getMessages: vi.fn(() => Promise.resolve({ messages: [], next_before: null })),
  listUsers: vi.fn(),
  listGroups: vi.fn(),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listInvites: vi.fn(() => Promise.resolve({ invites: [] })),
  getSettings: vi.fn(() => Promise.resolve({ group_creation: 'anyone' })),
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
    fireEvent.click(screen.getByTitle('Show chat'))
    expect(screen.getByRole('separator')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' })
    fireEvent.click(screen.getByTitle('Show posts'))

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

  it('lists my groups in the nav, names a DM by the other person, and opens a chat-only group with one pane', async () => {
    const { getMessages } = await import('../api')
    const { container } = await home()
    expect(nav().getByRole('button', { name: 'Knitting' })).toBeTruthy()
    expect(nav().getByRole('button', { name: 'kit' })).toBeTruthy()
    expect(nav().getByRole('button', { name: 'New group' })).toBeTruthy()

    fireEvent.click(nav().getByRole('button', { name: 'Knitting' }))
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('knit', null))
    expect(window.location.pathname).toBe('/g/knit')
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).toBeNull()
    // Chat only: no divider, no posts editor; the group's name and its Members control are shown.
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Knitting' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Members' })).toBeTruthy()
    expect(container.querySelectorAll('.ProseMirror').length).toBe(1)
    // Members shows alone: the group's view is still mounted but out of sight.
    fireEvent.click(screen.getByRole('button', { name: 'Members' }))
    await screen.findByRole('heading', { name: 'Members' })
    expect(window.location.pathname).toBe('/g/knit/members')
    expect(container.querySelector('.ProseMirror')!.closest('.hidden')).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Knitting' })!.closest('.hidden')).not.toBeNull()
  })

  it('opens whatever page the URL names, and the back button returns', async () => {
    const { getMessages } = await import('../api')
    await home('/g/knit/members')
    await screen.findByRole('heading', { name: 'Members' })
    expect(screen.getByRole('heading', { name: 'Knitting' }).closest('.hidden')).not.toBeNull()
    // The group named by the URL is the one mounted behind the page.
    await vi.waitFor(() => expect(getMessages).toHaveBeenCalledWith('knit', null))
    expect(getMessages).not.toHaveBeenCalledWith(ROOT, null)

    fireEvent.click(nav().getByRole('button', { name: 'People' }))
    await screen.findByRole('heading', { name: 'People' })
    expect(window.location.pathname).toBe('/people')
    window.history.back()
    await screen.findByRole('heading', { name: 'Members' })
    expect(window.location.pathname).toBe('/g/knit/members')
  })

  it('shows the root group for a path it does not know', async () => {
    await home('/nowhere')
    await screen.findByText('p1')
    expect(window.location.pathname).toBe('/')
  })

  it('hides New group when the root group says I may not', async () => {
    const { listGroups } = await import('../api')
    vi.mocked(listGroups).mockResolvedValue({
      groups: [group(ROOT, 'member', { can: { ...group(ROOT, 'member').can, create_groups: false } })],
    })
    await home()
    expect(nav().queryByRole('button', { name: 'New group' })).toBeNull()
  })
})
