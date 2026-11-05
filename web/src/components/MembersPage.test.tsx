// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { group, member, renderWithQuery, user } from '../test-utils'

/**
 * A group's members page shows exactly what the group's can flags allow:
 * the owner adds, removes, sets roles and hands over (with a confirm);
 * a member sees the list and Leave. Nothing here reasons about roles.
 */
vi.mock('../api', () => ({
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
  it('lets the owner add someone who is not yet in, and remove someone who is', async () => {
    const { addMember, removeMember } = await import('../api')
    await page('owner')
    // Only people not already in the group are offered.
    const picker = screen.getByLabelText('Add someone')
    expect(within(picker).queryByText('mo')).toBeNull()
    fireEvent.change(picker, { target: { value: 'jo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(addMember).toHaveBeenCalledWith('club', 'jo')
    await screen.findByText('jo')
    fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Remove' }))
    expect(removeMember).toHaveBeenCalledWith('club', 'mo')
    // Gone from the list; back among the people who can be added.
    await vi.waitFor(() => expect(within(screen.getByRole('list')).queryByText('mo')).toBeNull())
    expect(within(screen.getByLabelText('Add someone')).getByText('mo')).toBeTruthy()
  })

  it('lets the owner set roles and hand over, the latter after a confirm', async () => {
    const { setMemberRole } = await import('../api')
    await page('owner')
    expect(within(rowOf('kit')).queryByRole('button', { name: /Make|Remove/ })).toBeNull()
    fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Make moderator' }))
    expect(setMemberRole).toHaveBeenCalledWith('club', 'mo', 'moderator')
    await within(rowOf('mo')).findByRole('button', { name: 'Make member' })
    fireEvent.click(within(rowOf('mo')).getByRole('button', { name: 'Make owner' }))
    expect(setMemberRole).not.toHaveBeenCalledWith('club', 'mo', 'owner')
    const dialog = screen.getByRole('dialog', { hidden: true })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch ownership' }))
    expect(setMemberRole).toHaveBeenCalledWith('club', 'mo', 'owner')
  })

  it('lets the owner rename the group and change its mode', async () => {
    const { updateGroup } = await import('../api')
    await page('owner')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Knitting' } })
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'chat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateGroup).toHaveBeenCalledWith('club', { name: 'Knitting', mode: 'chat' })
  })

  it('a conversation: nobody is added, a word with someone else is another one, and a person steps out of it', async () => {
    const { listMembers, openDM } = await import('../api')
    const { MembersPage } = await import('./MembersPage')
    const { dm } = await import('../test-utils')
    vi.mocked(listMembers).mockResolvedValueOnce({
      members: [
        { group_id: 'club', user: kit, role: 'member', joined_at: 1, left_at: 7 },
        { group_id: 'club', user: mo, role: 'member', joined_at: 1, left_at: null },
      ],
    })
    vi.mocked(openDM).mockResolvedValue(dm('d2', [kit, mo, user('jo')]))
    const onOpen = vi.fn()
    renderWithQuery(<MembersPage group={dm('club', [kit, mo])} me={mo} onLeft={() => {}} onOpen={onOpen} />)
    await screen.findByText('mo')
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByLabelText('Add someone')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(rowOf('kit').textContent).toContain('stepped out')
    fireEvent.change(await screen.findByLabelText('With someone else'), { target: { value: 'jo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(openDM).toHaveBeenCalledWith(['kit', 'jo'])
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'd2' })))
    fireEvent.click(screen.getByRole('button', { name: 'Leave conversation' }))
    expect(within(screen.getByRole('dialog', { hidden: true })).getByText('Leave this conversation?')).toBeTruthy()
  })

  it('shows a member the list and Leave, nothing else', async () => {
    const { removeMember } = await import('../api')
    const onLeft = await page('member')
    expect(screen.queryByLabelText('Add someone')).toBeNull()
    expect(screen.queryByRole('button', { name: /Make / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByLabelText('Name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Leave' }))
    expect(removeMember).toHaveBeenCalledWith('club', 'mo')
    await vi.waitFor(() => expect(onLeft).toHaveBeenCalled())
  })
})
