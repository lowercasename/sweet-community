// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { group, member, user, renderWithQuery } from '../test-utils'

/** Creating a group requires only a name and an audience. */
vi.mock('../api', () => ({
  getMe: vi.fn(() => Promise.resolve(user('me'))),
  listUsers: vi.fn(() => Promise.resolve({ users: [member('me'), member('kit'), member('mo')] })),
  createGroup: vi.fn((name: string, visibility: string) =>
    Promise.resolve(group('new', 'owner', { name, visibility: visibility as 'open' })),
  ),
}))

afterEach(cleanup)

describe('NewGroupPage', () => {
  it('creates a group from a name and an audience and passes it to onCreated', async () => {
    const { createGroup } = await import('../api')
    const { NewGroupPage } = await import('./NewGroupPage')
    const onCreated = vi.fn()
    renderWithQuery(<NewGroupPage onCreated={onCreated} />)
    expect(screen.getByRole('button', { name: 'Create room' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Knitting' } })
    expect(screen.getByRole('radio', { name: 'Open' })).toHaveProperty('checked', true)
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    expect(createGroup).toHaveBeenCalledWith('Knitting', 'open', [])
    await vi.waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new', name: 'Knitting' })),
    )
  })

  it('keeps selections while searching and switching visibility, and removes people from the summary', async () => {
    const { createGroup } = await import('../api')
    const { NewGroupPage } = await import('./NewGroupPage')
    renderWithQuery(<NewGroupPage onCreated={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Private' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'kit' }))
    expect(screen.queryByRole('checkbox', { name: 'me' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search people' }), { target: { value: 'mo' } })
    expect(screen.getByRole('button', { name: 'Remove kit' })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'mo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove kit' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Open' }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Private' }))
    expect(screen.getByRole('checkbox', { name: 'mo' })).toHaveProperty('checked', true)
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Private plans' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    await vi.waitFor(() => expect(createGroup).toHaveBeenCalledWith('Private plans', 'private', ['mo']))
  })
})
