// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, dm, group, nameOf, renderWithQuery, user } from '../test-utils'

/**
 * The phone's menu holds what the nav column holds, in the same blocks,
 * with the account first and Sign out last. Search and Alerts are tabs, so
 * they are not here; DMs are behind Messages, as in the column.
 */
vi.mock('../api', () => ({
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

const raphael = user('raphael')
const kit = user('kit')

afterEach(cleanup)

describe('MenuPage', () => {
  it('lists Home, the Rooms section, the Messages section, then People and Settings, then Sign out', async () => {
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
    expect(screen.getAllByRole('button').map(nameOf)).toEqual([
      'Home',
      'New room',
      'Knitting',
      'New message',
      'kit',
      'All messages',
      'People',
      'Settings',
      'Sign out',
    ])
    expect(within(screen.getByRole('group', { name: 'Rooms' })).getByRole('button', { name: 'Knitting' })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Messages' })).getByRole('button', { name: 'kit' })).toBeTruthy()
    expect(screen.getByText('raphael')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(onGo).toHaveBeenCalledWith('/')
    fireEvent.click(screen.getByRole('button', { name: 'All messages' }))
    expect(onGo).toHaveBeenCalledWith('/messages')
    fireEvent.click(screen.getByRole('button', { name: 'kit' }))
    expect(onGo).toHaveBeenCalledWith('/r/d1')
    fireEvent.click(screen.getByRole('button', { name: 'New room' }))
    expect(onGo).toHaveBeenCalledWith('/rooms/new')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onLogout).toHaveBeenCalled()
  })
})
