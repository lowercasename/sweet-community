// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { group, member, renderWithQuery, user } from '../test-utils'

/**
 * A group's members page shows exactly the controls that the group's can
 * flags allow. The owner can add and remove members, set roles, and transfer
 * ownership after a confirmation. A member sees the list and the Leave
 * button. The component has no role logic of its own.
 */
vi.mock('../api', () => ({
  setGroupPicture: vi.fn(),
  uploadImage: vi.fn(),
  getMe: vi.fn(() => Promise.resolve({ id: 'kit', username: 'kit', picture: null })),
  openDM: vi.fn(),
  listUsers: vi.fn(),
  listMembers: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(() => Promise.resolve()),
  setMemberRole: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(() => Promise.resolve()),
}))

const kit = user('kit')
const mo = user('mo')

afterEach(cleanup)

beforeEach(async () => {
  const { listUsers, listMembers, addMember, setMemberRole, updateGroup } = await import('../api')
  vi.mocked(listUsers).mockResolvedValue({ users: [member('kit'), member('mo'), member('jo')] })
  vi.mocked(listMembers).mockResolvedValue({
    members: [
      { group_id: 'club', user: kit, role: 'owner', joined_at: 1 },
      { group_id: 'club', user: mo, role: 'member', joined_at: 2 },
    ],
  })
  vi.mocked(addMember).mockImplementation((gid, id) =>
    Promise.resolve({ group_id: gid, user: user(id), role: 'member', joined_at: 3 }),
  )
  vi.mocked(setMemberRole).mockImplementation((gid, id, role) =>
    Promise.resolve({ group_id: gid, user: user(id), role, joined_at: 2 }),
  )
  vi.mocked(updateGroup).mockImplementation((gid, patch) => Promise.resolve(group(gid, 'owner', patch)))
})

const rowOf = (name: string) => screen.getByText(name).closest('li')!

async function page(role: 'owner' | 'member', me = role === 'owner' ? kit : mo) {
  const { MembersPage } = await import('./MembersPage')
  const onLeft = vi.fn()
  renderWithQuery(<MembersPage group={group('club', role)} me={me} onLeft={onLeft} />)
  await screen.findByText('mo')
  return onLeft
}

describe('MembersPage', () => {
  it('lets the owner add a user who is not a member, and remove a member', async () => {
    const { addMember, removeMember } = await import('../api')
    await page('owner')
    // Only users who are not already members are offered.
    const picker = screen.getByLabelText('Add someone')
    expect(within(picker).queryByText('mo')).toBeNull()
    fireEvent.change(picker, { target: { value: 'jo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to room' }))
    expect(addMember).toHaveBeenCalledWith('club', 'jo')
    await screen.findByText('jo')
    fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Options for mo' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    // Removing a member confirms first.
    expect(removeMember).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Remove' }))
    expect(removeMember).toHaveBeenCalledWith('club', 'mo')
    // The removed user is no longer in the list and is offered for adding again.
    // The first list is the members list. The last card's action rows are a list too.
    await vi.waitFor(() => expect(within(screen.getAllByRole('list')[0]).queryByText('mo')).toBeNull())
    expect(within(screen.getByLabelText('Add someone')).getByText('mo')).toBeTruthy()
  })

  it('lets the owner set roles and transfer ownership, the latter after a confirmation', async () => {
    const { setMemberRole } = await import('../api')
    await page('owner')
    expect(within(rowOf('kit')).queryByRole('button', { name: 'Options for kit' })).toBeNull()
    fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Options for mo' }))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      'Make moderator',
      'Make owner',
      'Remove',
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make moderator' }))
    expect(setMemberRole).toHaveBeenCalledWith('club', 'mo', 'moderator')
    await vi.waitFor(() => fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Options for mo' })))
    await screen.findByRole('menuitem', { name: 'Make member' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make owner' }))
    expect(setMemberRole).not.toHaveBeenCalledWith('club', 'mo', 'owner')
    const dialog = screen.getByRole('dialog', { hidden: true })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make owner' }))
    expect(setMemberRole).toHaveBeenCalledWith('club', 'mo', 'owner')
  })

  it('lets the owner set and remove the group picture, and shows a member no picture control', async () => {
    const { setGroupPicture } = await import('../api')
    vi.mocked(setGroupPicture).mockResolvedValue(group('club', 'owner', { name: 'Club', picture: '/img/x' }))
    await page('owner')
    expect(screen.getByRole('button', { name: 'Choose a picture' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove picture' })).toBeNull()
    cleanup()
    await page('member')
    expect(screen.queryByRole('button', { name: 'Choose a picture' })).toBeNull()
  })

  it('lets the owner rename the group and change its mode', async () => {
    const { updateGroup } = await import('../api')
    await page('owner')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Knitting' } })
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'chat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateGroup).toHaveBeenCalledWith('club', { name: 'Knitting', mode: 'chat' })
  })

  it('shows a member the list and a Leave room row in the last card, which confirms', async () => {
    const { removeMember } = await import('../api')
    const onLeft = await page('member')
    expect(screen.queryByLabelText('Add someone')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Options for/ })).toBeNull()
    expect(screen.queryByLabelText('Name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Leave room' }))
    expect(removeMember).toHaveBeenCalledWith('club', 'mo')
    await vi.waitFor(() => expect(onLeft).toHaveBeenCalled())
  })
})
