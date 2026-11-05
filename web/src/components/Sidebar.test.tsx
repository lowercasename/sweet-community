// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { Group } from '../api'
import { ROOT, dm, group, nameOf, renderWithQuery, user } from '../test-utils'

/**
 * The nav column's three blocks (architecture.md, Layout): places (Home,
 * then the Groups section with its own New group control), tools
 * (Messages, Search, Alerts), the house (People, Settings). DMs are not
 * places here; they are behind Messages, which is current inside one.
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
const groupsSection = () => screen.getByRole('group', { name: 'Groups' })

describe('Sidebar', () => {
  it('holds places, then tools, then the house, with a rule between each block', async () => {
    const onGo = await draw([root(true), knitting, withKit])
    // Expanded, the section's control is in its title row, so it comes before the groups.
    expect(names()).toEqual([
      'Home',
      'New group',
      'Knitting',
      'Messages',
      'Search',
      'Alerts',
      'People',
      'Settings',
      'Collapse',
    ])
    expect(within(groupsSection()).getByRole('button', { name: 'Knitting' })).toBeTruthy()
    expect(within(groupsSection()).getByRole('button', { name: 'New group' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'kit' })).toBeNull()
    expect(screen.getByRole('navigation').querySelectorAll('hr').length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'New group' }))
    expect(onGo).toHaveBeenCalledWith('/groups/new')
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }))
    expect(onGo).toHaveBeenCalledWith('/messages')
    fireEvent.click(screen.getByRole('button', { name: 'Knitting' }))
    expect(onGo).toHaveBeenCalledWith('/g/knit')
  })

  it('shows the Groups section only when it has something to show', async () => {
    await draw([root(false), withKit])
    expect(screen.queryByRole('group', { name: 'Groups' })).toBeNull()
    cleanup()
    await draw([root(false), knitting])
    expect(within(groupsSection()).getByRole('button', { name: 'Knitting' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New group' })).toBeNull()
    cleanup()
    await draw([root(true)])
    expect(within(groupsSection()).getByRole('button', { name: 'New group' })).toBeTruthy()
  })

  it('marks the page being viewed: Messages for its page and for any DM', async () => {
    const current = () =>
      screen
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-current') === 'page')
        .map(nameOf)
    await draw([root(true), knitting, withKit], '/messages')
    expect(current()).toEqual(['Messages'])
    cleanup()
    await draw([root(true), knitting, withKit], '/g/d1')
    expect(current()).toEqual(['Messages'])
    cleanup()
    await draw([root(true), knitting, withKit], '/g/knit/members')
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
      'New group',
      'Messages',
      'Search',
      'Alerts',
      'People',
      'Settings',
      'Expand',
    ])
    expect(screen.queryByText('Groups')).toBeNull()
    expect(screen.getByRole('button', { name: 'Knitting' }).textContent).toBe('K')
    expect(nameOf(screen.getByRole('button', { name: 'Knitting' }))).toBe('Knitting')
    expect(screen.getByRole('navigation').querySelectorAll('hr').length).toBe(2)
  })
})
