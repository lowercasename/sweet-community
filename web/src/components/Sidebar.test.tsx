// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { Group } from '../api'
import { ROOT, dm, group, nameOf, renderWithQuery, user } from '../test-utils'

/**
 * The nav column's three blocks (architecture.md, Layout): places (Home,
 * the Rooms section with its own New room control, the Messages section
 * of my five latest conversations with All messages at its foot), tools
 * (Search, Notifications), the house (People, Settings).
 */
vi.mock('../api', () => ({
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

const raphael = user('raphael')
const kit = user('kit')
const root = (create: boolean) =>
  group(ROOT, 'owner', { can: { ...group(ROOT, 'owner').can, create_groups: create || undefined } })
const knitting = group('knit', 'member', { name: 'Knitting' })
const withKit = dm('d1', [kit, raphael])
const mo = user('mo')
const jo = user('jo')
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
      'All messages',
      'Search',
      'Notifications',
      'People',
      'Settings',
      'Collapse',
    ])
    expect(within(groupsSection()).getByRole('button', { name: 'Knitting' })).toBeTruthy()
    expect(within(groupsSection()).getByRole('button', { name: 'New room' })).toBeTruthy()
    expect(within(messages()).getByRole('button', { name: 'kit' })).toBeTruthy()
    expect(screen.getByRole('navigation').querySelectorAll('hr').length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'New room' }))
    expect(onGo).toHaveBeenCalledWith('/rooms/new')
    fireEvent.click(screen.getByRole('button', { name: 'All messages' }))
    expect(onGo).toHaveBeenCalledWith('/messages')
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
    // No conversations yet: the section still offers to start one, and the full list.
    await draw([root(true), knitting])
    expect(within(messages()).getAllByRole('button').map(nameOf)).toEqual(['New message', 'All messages'])
  })

  it('a conversation I have stepped out of is not in the nav', async () => {
    await draw([root(true), withKit, dm('out', [mo, raphael], { last_message_at: 100, left_at: 5 })])
    expect(within(messages()).getAllByRole('button').map(nameOf)).toEqual(['New message', 'kit', 'All messages'])
  })

  it('names a conversation by its other people and marks it by their faces: one, two, or one and a count', async () => {
    await draw([root(true), withKit, dm('d2', [kit, mo, raphael]), dm('d3', [jo, kit, mo, raphael])], '/', false)
    const item = (name: string) => screen.getByRole('button', { name })
    expect(item('kit').querySelectorAll('img').length).toBe(1)
    expect(item('kit, mo').querySelectorAll('img').length).toBe(2)
    expect(item('jo, kit, mo').querySelectorAll('img').length).toBe(1)
    expect(item('jo, kit, mo').textContent).toBe('+2')
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
    await draw([root(true), knitting, withKit], '/messages')
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
    // Collapsed, there is no title row: the control closes the block.
    expect(names()).toEqual([
      'Home',
      'Knitting',
      'New room',
      'kit',
      'All messages',
      'New message',
      'Search',
      'Notifications',
      'People',
      'Settings',
      'Expand',
    ])
    expect(screen.queryByText('Rooms')).toBeNull()
    expect(screen.queryByText('Messages')).toBeNull()
    expect(screen.getByRole('button', { name: 'Knitting' }).textContent).toBe('K')
    expect(nameOf(screen.getByRole('button', { name: 'Knitting' }))).toBe('Knitting')
    expect(screen.getByRole('navigation').querySelectorAll('hr').length).toBe(2)
  })
})
