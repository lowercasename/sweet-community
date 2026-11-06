// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { Group } from '../api'
import { ROOT, dm, group, marker, nameOf, notification, renderWithQuery, user } from '../test-utils'

/**
 * The nav column's three blocks (architecture.md, Layout): places (Home,
 * the Rooms section with its own New room control, the Messages section
 * of my five latest conversations with All messages at its foot), tools
 * (Search, Notifications), the house (People, and me).
 */
vi.mock('../api', () => ({
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  listNotifications: vi.fn(() => Promise.resolve({ notifications: [], next_before: null })),
  listMarkers: vi.fn(() => Promise.resolve({ markers: [] })),
  getSettings: vi.fn(() =>
    Promise.resolve({ group_creation: 'anyone', name: 'Knitting Circle', description: '', owner_set: true }),
  ),
}))

const raphael = user('raphael')
const kit = user('kit')
const root = (create: boolean) =>
  group(ROOT, 'owner', { can: { ...group(ROOT, 'owner').can, create_groups: create || undefined } })
const knitting = group('knit', 'member', { name: 'Knitting' })
const withKit = dm('d1', [kit, raphael])
const mo = user('mo')
/** Seven conversations, the newest word in d7, the oldest in d1. */
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
  it('holds places, then tools, then the house, with a rule between each block', async () => {
    const onGo = await draw([root(true), knitting, withKit])
    // Expanded, the section's control is in its title row, so it comes before the groups.
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

  it('lists the five conversations with the latest word, the open one too, and All messages at the foot', async () => {
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
    // Opened from the full list, an older one joins the section while it is open, after the five.
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
    // No conversations yet: the section still offers to start one; All messages has nothing to add.
    await draw([root(true), knitting])
    expect(within(messages()).getAllByRole('button').map(nameOf)).toEqual(['New message'])
  })

  it('a conversation I have hidden is not in the nav', async () => {
    await draw([root(true), withKit, dm('out', [mo, raphael], { last_message_at: 100, hidden_at: 5 })])
    expect(within(messages()).getAllByRole('button').map(nameOf)).toEqual(['New message', 'kit', 'All messages'])
  })

  it('names a conversation by its other person and marks it by their face', async () => {
    await draw([root(true), withKit, dm('d2', [mo, raphael])], '/', false)
    const item = (name: string) => screen.getByRole('button', { name })
    expect(item('kit').querySelectorAll('img').length).toBe(1)
    expect(item('mo').querySelectorAll('img').length).toBe(1)
  })

  it('lists rooms alphabetically, case aside, whatever order they came in', async () => {
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

  it('shows the Rooms section only when it has something to show', async () => {
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

  it('marks the page being viewed: All messages for its page, a conversation for itself', async () => {
    const current = () =>
      screen
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-current') === 'page')
        .map(nameOf)
    // All messages is there to be current only when the section does not show everything.
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

  it('collapsed, keeps every name, drops the section title, and shows a group by its initial', async () => {
    await draw([root(true), knitting, withKit], '/', false)
    // Collapsed, there is no title row and no section control: a plus among the tiles took the room of a place.
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

  it('the bell carries a dot while a notification is newer than my marker, and opens the page', async () => {
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

  it('marks unread messages on Home, a room and a conversation with a dot, never a number', async () => {
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
    // Either stream lights a room.
    expect(screen.getByRole('button', { name: 'Knitting, unread' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'kit, unread' }).textContent).not.toContain('12')
    cleanup()
    await draw([root(false), knitting, withKit], '/', false)
    await screen.findByRole('button', { name: 'Home, unread' })
  })

  it('the account row at the foot is me: it opens my own page, and is current there', async () => {
    const onGo = await draw([root(false)], '/u/raphael')
    const me = screen.getByRole('button', { name: 'raphael' })
    expect(me.getAttribute('aria-current')).toBe('page')
    fireEvent.click(me)
    expect(onGo).toHaveBeenCalledWith('/u/raphael')
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
  })

  it('a room with a picture is marked by it; one without, by its initial', async () => {
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
