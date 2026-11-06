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
  getMe: vi.fn(() => Promise.resolve({ id: 'raphael', username: 'raphael', picture: null })),
  listUsers: vi.fn(),
  listInvites: vi.fn(() => Promise.resolve({ invites: [] })),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  setMemberRole: vi.fn(),
  openDM: vi.fn(),
  removeUser: vi.fn(() => Promise.resolve()),
}))

afterEach(cleanup)

beforeEach(async () => {
  const { listUsers, setMemberRole } = await import('../api')
  vi.mocked(listUsers).mockResolvedValue({
    users: [member('raphael', 'owner'), member('kit', 'member', true), member('mo', 'moderator', true)],
  })
  vi.mocked(setMemberRole).mockImplementation((gid, id, role) =>
    Promise.resolve({ group_id: gid, user: user(id), role, joined_at: 1 }),
  )
})

const rowOf = (name: string) => screen.getByText(name).closest('li')!

describe('PeoplePage', () => {
  it('starts a DM from a person, never from myself', async () => {
    const { openDM } = await import('../api')
    const { dm } = await import('../test-utils')
    vi.mocked(openDM).mockResolvedValue(dm('d1', [user('kit'), user('raphael')]))
    const { PeoplePage } = await import('./PeoplePage')
    const onOpenGroup = vi.fn()
    renderWithQuery(<PeoplePage me={user('raphael')} root={group(ROOT, 'owner')} onOpenGroup={onOpenGroup} />)
    await screen.findByText('kit')
    expect(within(rowOf('raphael')).queryByRole('button', { name: 'Message' })).toBeNull()
    fireEvent.click(within(rowOf('kit')).getByRole('button', { name: 'Message' }))
    expect(openDM).toHaveBeenCalledWith('kit')
    await vi.waitFor(() => expect(onOpenGroup).toHaveBeenCalledWith('d1'))
  })

  it('lets the owner promote and demote anyone but themselves', async () => {
    const { setMemberRole } = await import('../api')
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={user('raphael')} root={group(ROOT, 'owner')} onOpenGroup={() => {}} />)
    await screen.findByText('mo')
    expect(within(rowOf('raphael')).queryByRole('button', { name: /Message|Options/ })).toBeNull()
    // A role change refetches the list, since who may remove whom moves with it; the server would answer with the new role.
    const { listUsers } = await import('../api')
    vi.mocked(listUsers).mockResolvedValue({
      users: [member('raphael', 'owner'), member('kit', 'moderator', true), member('mo', 'moderator', true)],
    })
    fireEvent.click(within(rowOf('kit')).getByRole('button', { name: 'Options for kit' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make moderator' }))
    expect(setMemberRole).toHaveBeenCalledWith(ROOT, 'kit', 'moderator')
    await vi.waitFor(() => fireEvent.click(within(rowOf('kit')).getByRole('button', { name: 'Options for kit' })))
    await screen.findByRole('menuitem', { name: 'Make member' })
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Options for mo' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make member' }))
    expect(setMemberRole).toHaveBeenCalledWith(ROOT, 'mo', 'member')
  })

  it('offers Remove where the server says so, never on myself, and removes after a confirm', async () => {
    const { removeUser } = await import('../api')
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={user('raphael')} root={group(ROOT, 'owner')} onOpenGroup={() => {}} />)
    await screen.findByText('mo')
    expect(within(rowOf('raphael')).queryByRole('button', { name: 'Options for raphael' })).toBeNull()
    fireEvent.click(within(rowOf('kit')).getByRole('button', { name: 'Options for kit' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(removeUser).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(within(dialog).getByText('Remove kit from this place?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(removeUser).toHaveBeenCalledWith('kit')
    // Gone from the list at once.
    await vi.waitFor(() => expect(screen.queryByText('kit')).toBeNull())
  })

  it('shows a moderator the invite tools but no role controls', async () => {
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={user('mo')} root={group(ROOT, 'moderator')} onOpenGroup={() => {}} />)
    await screen.findByText('kit')
    expect(screen.getByText('Invite someone')).toBeTruthy()
    // A moderator may remove a member, not set roles: the row's menu holds Remove alone.
    fireEvent.click(screen.getByRole('button', { name: 'Options for kit' }))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Remove'])
  })

  it('shows a member only the list', async () => {
    const { listUsers } = await import('../api')
    vi.mocked(listUsers).mockResolvedValue({
      users: [member('raphael', 'owner'), member('kit', 'member', true), member('mo', 'moderator')],
    })
    const { PeoplePage } = await import('./PeoplePage')
    renderWithQuery(<PeoplePage me={user('kit')} root={group(ROOT, 'member')} onOpenGroup={() => {}} />)
    await screen.findByText('mo')
    expect(screen.queryByText('Invite someone')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Options for/ })).toBeNull()
  })
})
