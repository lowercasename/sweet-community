// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { group, renderWithQuery } from '../test-utils'

/** Creating a group requires only a name and an audience. */
vi.mock('../api', () => ({
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
    fireEvent.click(screen.getByRole('radio', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    expect(createGroup).toHaveBeenCalledWith('Knitting', 'open')
    await vi.waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new', name: 'Knitting' })),
    )
  })
})
