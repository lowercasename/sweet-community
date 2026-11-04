// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { me, renderWithQuery, user } from '../test-utils'

/**
 * The owner assigns roles from the People page: member or moderator, for
 * anyone but themselves. Everyone else sees the list and no controls. What
 * the owner may do comes from /api/me's abilities, not from a role check here.
 */
vi.mock('../api', () => ({
  listUsers: vi.fn(),
  listInvites: vi.fn(() => Promise.resolve({ invites: [] })),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  setRole: vi.fn(),
}))

afterEach(cleanup)

beforeEach(async () => {
  const { listUsers, setRole } = await import('../api')
  vi.mocked(listUsers).mockResolvedValue({
    users: [
      { ...user('raphael', 'owner'), created_at: 1 },
      { ...user('kit'), created_at: 2 },
      { ...user('mo', 'moderator'), created_at: 3 },
    ],
  })
  vi.mocked(setRole).mockImplementation((id, role) => Promise.resolve({ ...user(id, role) }))
})

const rowOf = (name: string) => screen.getByText(name).closest('li')!

describe('PeoplePage', () => {
  it('lets the owner promote and demote anyone but themselves', async () => {
    const { setRole } = await import('../api')
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={me('raphael', 'owner')} />)
    await screen.findByText('mo')
    expect(within(rowOf('raphael')).queryByRole('button')).toBeNull()
    fireEvent.click(within(rowOf('kit')).getByRole('button', { name: 'Make moderator' }))
    expect(setRole).toHaveBeenCalledWith('kit', 'moderator')
    await within(rowOf('kit')).findByRole('button', { name: 'Make member' })
    fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Make member' }))
    expect(setRole).toHaveBeenCalledWith('mo', 'member')
  })

  it('shows a moderator the invite tools but no role controls', async () => {
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={me('mo', 'moderator')} />)
    await screen.findByText('kit')
    expect(screen.getByText('Invite someone')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Make / })).toBeNull()
  })

  it('shows a member only the list', async () => {
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={me('kit')} />)
    await screen.findByText('mo')
    expect(screen.queryByText('Invite someone')).toBeNull()
    expect(screen.queryByRole('button', { name: /Make / })).toBeNull()
  })
})
