// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, dm, group, nameOf, paragraph, renderWithQuery, user } from '../test-utils'

/**
 * The phone menu contains the same items as the nav column, in the same
 * sections, with the account first and Sign out last. Search and
 * Notifications are tabs, so they are not in the menu. DMs are under
 * Messages, as in the nav column.
 */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  listMarkers: vi.fn(() =>
    Promise.resolve({ markers: [{ user_id: 'raphael', stream: 'chat:knit', read_at: 0, unread: 2 }] }),
  ),
  getSettings: vi.fn(() => Promise.resolve({ group_creation: 'anyone', name: '', description: '', owner_set: true })),
  getVersion: vi.fn(() => Promise.resolve({ release: 'v1.2.3', build: 'abcdef123456' })),
  getRules: vi.fn(() => Promise.resolve({ body_html: '' })),
}))

const raphael = user('raphael')
const kit = user('kit')

afterEach(cleanup)
beforeEach(async () => {
  const { getRules } = await import('../api')
  vi.mocked(getRules).mockResolvedValue({ body_html: '' })
})

describe('MenuPage', () => {
  it('ends with Rules, before Sign out, when the community has rules (architecture.md, Admin tools)', async () => {
    const { getRules } = await import('../api')
    vi.mocked(getRules).mockResolvedValue({ body_html: paragraph('Be kind.') })
    const { MenuPage } = await import('./MenuPage')
    const onGo = vi.fn()
    renderWithQuery(<MenuPage me={raphael} groups={[group(ROOT, 'member')]} onGo={onGo} onLogout={() => {}} />)
    const rules = await screen.findByRole('button', { name: 'Rules' })
    const names = screen.getAllByRole('button').map(nameOf)
    expect(names.slice(-2)).toEqual(['Rules', 'Sign out'])
    fireEvent.click(rules)
    expect(onGo).toHaveBeenCalledWith('/rules')
  })

  it('names the release at the bottom (architecture.md, Updates)', async () => {
    const { MenuPage } = await import('./MenuPage')
    renderWithQuery(<MenuPage me={raphael} groups={[group(ROOT, 'owner')]} onGo={() => {}} onLogout={() => {}} />)
    await screen.findByText('Sweet v1.2.3')
  })

  it('lists the user, Home, the Rooms section, the Conversations section, People and Sign out, in that order', async () => {
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
      'New conversation',
      'kit',
      'People',
      'Community',
      'Sign out',
    ])
    expect(
      within(screen.getByRole('group', { name: 'Rooms' })).getByRole('button', { name: 'Knitting, unread' }),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('group', { name: 'Conversations' })).getByRole('button', { name: 'kit' }),
    ).toBeTruthy()
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
