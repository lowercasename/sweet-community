// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { group, renderWithQuery } from '../test-utils'

/** Creating a group requires only a name and a mode. */
vi.mock('../api', () => ({
  createGroup: vi.fn((name: string, mode: string) =>
    Promise.resolve(group('new', 'owner', { name, mode: mode as 'both' })),
  ),
}))

afterEach(cleanup)

describe('NewGroupPage', () => {
  it('creates a group from a name and a mode and passes it to onCreated', async () => {
    const { createGroup } = await import('../api')
    const { NewGroupPage } = await import('./NewGroupPage')
    const onCreated = vi.fn()
    renderWithQuery(<NewGroupPage onCreated={onCreated} />)
    expect(screen.getByRole('button', { name: 'Create room' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Knitting' } })
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'posts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    expect(createGroup).toHaveBeenCalledWith('Knitting', 'posts')
    await vi.waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new', name: 'Knitting' })),
    )
  })
})
