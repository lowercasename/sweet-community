// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, dm, group, nameOf, renderWithQuery, user } from '../test-utils'

/**
 * The phone's menu holds what the nav column holds, in the same blocks,
 * with the account first and Sign out last. Search and Notifications are tabs, so
 * they are not here; DMs are behind Messages, as in the column.
 */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  listMarkers: vi.fn(() =>
    Promise.resolve({ markers: [{ user_id: 'raphael', stream: 'chat:knit', read_at: 0, unread: 2 }] }),
  ),
  getSettings: vi.fn(() => Promise.resolve({ group_creation: 'anyone', name: '', description: '', owner_set: true })),
}))

const raphael = user('raphael')
const kit = user('kit')

afterEach(cleanup)

describe('MenuPage', () => {
  it('lists me, Home, the Rooms section, the Messages section, then People, then Sign out', async () => {
    const { MenuPage } = await import('./MenuPage')
    const onGo = vi.fn()
    const onLogout = vi.fn()
    renderWithQuery(
      <MenuPage
        me={raphael}
        groups={[group(ROOT, 'owner'), group('knit', 'member', { name: 'Knitting' }), dm('d1', [kit, raphael])]}
        onGo={onGo}
        onLogout={onLogout}
      />,
    )
    await screen.findByRole('button', { name: 'Knitting, unread' })
    expect(screen.getAllByRole('button').map(nameOf)).toEqual([
      'raphael',
      'Home',
      'New room',
      'Knitting, unread',
      'New message',
      'kit',
      'People',
      'Community',
      'Sign out',
    ])
    expect(
      within(screen.getByRole('group', { name: 'Rooms' })).getByRole('button', { name: 'Knitting, unread' }),
    ).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Messages' })).getByRole('button', { name: 'kit' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'raphael' }))
    expect(onGo).toHaveBeenCalledWith('/u/raphael')

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(onGo).toHaveBeenCalledWith('/')
    fireEvent.click(screen.getByRole('button', { name: 'kit' }))
    expect(onGo).toHaveBeenCalledWith('/r/d1')
    fireEvent.click(screen.getByRole('button', { name: 'New room' }))
    expect(onGo).toHaveBeenCalledWith('/rooms/new')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onLogout).toHaveBeenCalled()
  })
})
