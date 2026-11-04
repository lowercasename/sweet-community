// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, group, member, renderWithQuery, user } from '../test-utils'

/**
 * The root group's owner assigns roles from the People page: member or
 * moderator, for anyone but themselves. What they may do comes from the
 * root group's can flags, never from a role check here.
 */
vi.mock('../api', () => ({
  listUsers: vi.fn(),
  listInvites: vi.fn(() => Promise.resolve({ invites: [] })),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  setMemberRole: vi.fn(),
}))

afterEach(cleanup)

beforeEach(async () => {
  const { listUsers, setMemberRole } = await import('../api')
  vi.mocked(listUsers).mockResolvedValue({
    users: [member('raphael', 'owner'), member('kit'), member('mo', 'moderator')],
  })
  vi.mocked(setMemberRole).mockImplementation((gid, id, role) =>
    Promise.resolve({ group_id: gid, user: user(id), role, joined_at: 1 }),
  )
})

const rowOf = (name: string) => screen.getByText(name).closest('li')!

describe('PeoplePage', () => {
  it('lets the owner promote and demote anyone but themselves', async () => {
    const { setMemberRole } = await import('../api')
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={user('raphael')} root={group(ROOT, 'owner')} />)
    await screen.findByText('mo')
    expect(within(rowOf('raphael')).queryByRole('button')).toBeNull()
    fireEvent.click(within(rowOf('kit')).getByRole('button', { name: 'Make moderator' }))
    expect(setMemberRole).toHaveBeenCalledWith(ROOT, 'kit', 'moderator')
    await within(rowOf('kit')).findByRole('button', { name: 'Make member' })
    fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Make member' }))
    expect(setMemberRole).toHaveBeenCalledWith(ROOT, 'mo', 'member')
  })

  it('shows a moderator the invite tools but no role controls', async () => {
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={user('mo')} root={group(ROOT, 'moderator')} />)
    await screen.findByText('kit')
    expect(screen.getByText('Invite someone')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Make / })).toBeNull()
  })

  it('shows a member only the list', async () => {
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={user('kit')} root={group(ROOT, 'member')} />)
    await screen.findByText('mo')
    expect(screen.queryByText('Invite someone')).toBeNull()
    expect(screen.queryByRole('button', { name: /Make / })).toBeNull()
  })
})
