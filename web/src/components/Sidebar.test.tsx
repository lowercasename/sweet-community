// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { Group } from '../api'
import { ROOT, dm, group, marker, nameOf, notification, renderWithQuery, user } from '../test-utils'

/**
 * The nav column has three blocks (architecture.md, Layout). The first block
 * lists the groups. It has Home, the Rooms section with its own New room
 * control, and the Messages section with the user's five latest conversations
 * and All messages at the bottom. The second block has the tools, which are
 * Search and Notifications. The third block has the community items, which
 * are People and the user's own account.
 */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  listNotifications: vi.fn(() => Promise.resolve({ notifications: [], next_before: null })),
  listMarkers: vi.fn(() => Promise.resolve({ markers: [] })),
  getSettings: vi.fn(() =>
    Promise.resolve({ group_creation: 'anyone', name: 'Knitting Circle', description: '', owner_set: true }),
  ),
  getVersion: vi.fn(() => Promise.resolve({ release: 'v1.2.3', build: 'abcdef123456' })),
}))

const raphael = user('raphael')
const kit = user('kit')
const root = (create: boolean) =>
  group(ROOT, 'owner', { can: { ...group(ROOT, 'owner').can, create_groups: create || undefined } })
const knitting = group('knit', 'member', { name: 'Knitting' })
const withKit = dm('d1', [kit, raphael])
const mo = user('mo')
/** Seven conversations, the newest message in d7, the oldest in d1. */
const many = Array.from({ length: 7 }, (_, i) =>
  dm(`d${i + 1}`, [user(`p${i + 1}`), raphael], { last_message_at: i + 1 }),
)

afterEach(cleanup)

async function draw(groups: Group[], location = '/', expanded = true) {
  const { Sidebar } = await import('./Sidebar')
  const onGo = vi.fn()
  renderWithQuery(
    <Sidebar me={raphael} groups={groups} location={location} expanded={expanded} onGo={onGo} onToggle={() => {}} />,
  )
  return onGo
}

const names = () => screen.getAllByRole('button').map(nameOf)
const groupsSection = () => screen.getByRole('group', { name: 'Rooms' })
const messages = () => screen.getByRole('group', { name: 'Messages' })

describe('Sidebar', () => {
  it('names the release under Collapse when expanded, and not when collapsed (architecture.md, Updates)', async () => {
    await draw([root(true)])
    await screen.findByText('Sweet v1.2.3')
    cleanup()
    await draw([root(true)], '/', false)
    await screen.findByRole('button', { name: 'Expand' })
    expect(screen.queryByText('Sweet v1.2.3')).toBeNull()
  })

  it('shows the groups block, the tools block and the community block, with a rule between each block', async () => {
    const onGo = await draw([root(true), knitting, withKit])
    // When expanded, the section's control is in its title row, so it comes before the groups.
    expect(names()).toEqual([
      'Home',
      'New room',
      'Knitting',
      'New message',
      'kit',
      'Search',
      'Notifications',
      'People',
      'Community',
      'raphael',
      'Collapse',
    ])
    expect(within(groupsSection()).getByRole('button', { name: 'Knitting' })).toBeTruthy()
    expect(within(groupsSection()).getByRole('button', { name: 'New room' })).toBeTruthy()
    expect(within(messages()).getByRole('button', { name: 'kit' })).toBeTruthy()
    expect(screen.getByRole('navigation').querySelectorAll('hr').length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'New room' }))
    expect(onGo).toHaveBeenCalledWith('/rooms/new')
    fireEvent.click(screen.getByRole('button', { name: 'New message' }))
    expect(onGo).toHaveBeenCalledWith('/messages/new')
    fireEvent.click(screen.getByRole('button', { name: 'kit' }))
    expect(onGo).toHaveBeenCalledWith('/r/d1')
    fireEvent.click(screen.getByRole('button', { name: 'Knitting' }))
    expect(onGo).toHaveBeenCalledWith('/r/knit')
  })

  it('lists the five latest conversations, plus the open one, and All messages at the bottom', async () => {
    await draw([root(true), ...many])
    expect(within(messages()).getAllByRole('button').map(nameOf)).toEqual([
      'New message',
      'p7',
      'p6',
      'p5',
      'p4',
      'p3',
      'All messages',
    ])
    cleanup()
    // An older conversation opened from the full list is added after the five while it is open.
    await draw([root(true), ...many], '/r/d1')
    expect(within(messages()).getAllByRole('button').map(nameOf)).toEqual([
      'New message',
      'p7',
      'p6',
      'p5',
      'p4',
      'p3',
      'p1',
      'All messages',
    ])
    expect(within(messages()).getByRole('button', { name: 'p1' }).getAttribute('aria-current')).toBe('page')
    cleanup()
    // With no conversations, the section still shows New message. All messages is not shown, because it would list
    // nothing more.
    await draw([root(true), knitting])
    expect(within(messages()).getAllByRole('button').map(nameOf)).toEqual(['New message'])
  })

  it('a hidden conversation is not in the nav', async () => {
    await draw([root(true), withKit, dm('out', [mo, raphael], { last_message_at: 100, hidden_at: 5 })])
    expect(within(messages()).getAllByRole('button').map(nameOf)).toEqual(['New message', 'kit', 'All messages'])
  })

  it("labels a conversation with the other user's name and shows their avatar", async () => {
    await draw([root(true), withKit, dm('d2', [mo, raphael])], '/', false)
    const item = (name: string) => screen.getByRole('button', { name })
    expect(item('kit').querySelectorAll('img').length).toBe(1)
    expect(item('mo').querySelectorAll('img').length).toBe(1)
  })

  it('lists groups alphabetically, ignoring case, regardless of their input order', async () => {
    await draw([
      root(true),
      group('mods', 'member', { name: 'Mod Team' }),
      group('adhd', 'member', { name: 'adhd friends' }),
      group('its', 'member', { name: "It's A Room" }),
    ])
    expect(within(groupsSection()).getAllByRole('button').map(nameOf)).toEqual([
      'New room',
      'adhd friends',
      "It's A Room",
      'Mod Team',
    ])
  })

  it('shows the Rooms section only when it has a group or the New room control', async () => {
    await draw([root(false), withKit])
    expect(screen.queryByRole('group', { name: 'Rooms' })).toBeNull()
    cleanup()
    await draw([root(false), knitting])
    expect(within(groupsSection()).getByRole('button', { name: 'Knitting' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New room' })).toBeNull()
    cleanup()
    await draw([root(true)])
    expect(within(groupsSection()).getByRole('button', { name: 'New room' })).toBeTruthy()
  })

  it('marks All messages as current on its page and a conversation as current on its route', async () => {
    const current = () =>
      screen
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-current') === 'page')
        .map(nameOf)
    // All messages is shown, and can be current, only when the section does not list every conversation.
    await draw([root(true), knitting, ...many], '/messages')
    expect(current()).toEqual(['All messages'])
    cleanup()
    await draw([root(true), knitting, withKit], '/messages/new')
    expect(current()).toEqual(['New message'])
    cleanup()
    await draw([root(true), knitting, withKit], '/r/d1')
    expect(current()).toEqual(['kit'])
    cleanup()
    await draw([root(true), knitting, withKit], '/r/knit/members')
    expect(current()).toEqual(['Knitting'])
    cleanup()
    await draw([root(true), knitting, withKit], '/')
    expect(current()).toEqual(['Home'])
  })

  it('when collapsed, keeps every item name, hides the section titles, and shows a group by its initial', async () => {
    await draw([root(true), knitting, withKit], '/', false)
    // When collapsed, there is no title row and no section control. A plus button among the tiles took the space of
    // a group tile.
    expect(names()).toEqual([
      'Home',
      'Knitting',
      'kit',
      'Search',
      'Notifications',
      'People',
      'Community',
      'raphael',
      'Expand',
    ])
    expect(screen.queryByText('Rooms')).toBeNull()
    expect(screen.queryByText('Messages')).toBeNull()
    expect(screen.getByRole('button', { name: 'Knitting' }).textContent).toBe('K')
    expect(nameOf(screen.getByRole('button', { name: 'Knitting' }))).toBe('Knitting')
    expect(screen.getByRole('navigation').querySelectorAll('hr').length).toBe(2)
  })

  it('when collapsed with no groups and no conversations, renders no section', async () => {
    await draw([root(true)], '/', false)
    expect(screen.queryByRole('group')).toBeNull()
    expect(names()).toEqual(['Home', 'Search', 'Notifications', 'People', 'Community', 'raphael', 'Expand'])
    cleanup()
    // When expanded, each section is shown so that it can offer its control.
    await draw([root(true)], '/', true)
    expect(screen.getAllByRole('group').length).toBe(2)
  })

  it('Notifications shows a dot while a notification is newer than the read marker, and opens its page', async () => {
    const { listNotifications, listMarkers } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification('n9', 'comment', kit), notification('n3', 'added', kit)],
      next_before: null,
    })
    vi.mocked(listMarkers).mockResolvedValue({ markers: [marker('notifications', 3, 1)] })
    const onGo = await draw([root(false)])
    const bell = await screen.findByRole('button', { name: 'Notifications, unread' })
    fireEvent.click(bell)
    expect(onGo).toHaveBeenCalledWith('/notifications')
    cleanup()

    vi.mocked(listMarkers).mockResolvedValue({ markers: [marker('notifications', 9)] })
    await draw([root(false)], '/notifications')
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('aria-current')).toBe('page'),
    )
    expect(screen.queryByRole('button', { name: 'Notifications, unread' })).toBeNull()
  })

  it('marks unread messages on Home, a group and a conversation with a dot, never a number', async () => {
    const { listMarkers } = await import('../api')
    vi.mocked(listMarkers).mockResolvedValue({
      markers: [
        marker('notifications', 0),
        marker(`chat:${ROOT}`, 0, 3),
        marker('chat:knit', 0, 0),
        marker('feed:knit', 0, 2),
        marker('chat:d1', 0, 12),
      ],
    })
    await draw([root(false), knitting, withKit])
    const home = await screen.findByRole('button', { name: 'Home, unread' })
    expect(home.textContent).not.toContain('3')
    // Unread content in either stream marks a group as unread.
    expect(screen.getByRole('button', { name: 'Knitting, unread' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'kit, unread' }).textContent).not.toContain('12')
    cleanup()
    await draw([root(false), knitting, withKit], '/', false)
    await screen.findByRole('button', { name: 'Home, unread' })
  })

  it('the account row at the bottom is the user, opens their profile, and is current there', async () => {
    const onGo = await draw([root(false)], '/u/raphael')
    const me = screen.getByRole('button', { name: 'raphael' })
    expect(me.getAttribute('aria-current')).toBe('page')
    fireEvent.click(me)
    expect(onGo).toHaveBeenCalledWith('/u/raphael')
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
  })

  it('a group with a picture shows the picture, and a group without one shows its initial', async () => {
    await draw([root(false), knitting, group('wool', 'member', { name: 'Wool', picture: '/img/wool' })])
    expect(screen.getByRole('button', { name: 'Wool' }).querySelector('img')!.getAttribute('src')).toBe('/img/wool')
    expect(screen.getByRole('button', { name: 'Knitting' }).querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Knitting' }).textContent).toContain('K')
  })

  it('Search opens its page and is current there', async () => {
    const onGo = await draw([root(false)], '/search')
    const item = screen.getByRole('button', { name: 'Search' })
    expect(item.getAttribute('aria-current')).toBe('page')
    fireEvent.click(item)
    expect(onGo).toHaveBeenCalledWith('/search')
  })
})
