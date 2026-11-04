// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { group, renderWithQuery } from '../test-utils'

/** Making a group: a name and a mode, nothing else to decide. */
vi.mock('../api', () => ({
  createGroup: vi.fn((name: string, mode: string) =>
    Promise.resolve(group('new', 'owner', { name, mode: mode as 'both' })),
  ),
}))

afterEach(cleanup)

describe('NewGroupPage', () => {
  it('creates a group from a name and a mode and hands it back', async () => {
    const { createGroup } = await import('../api')
    const { NewGroupPage } = await import('./NewGroupPage')
    const onCreated = vi.fn()
    renderWithQuery(<NewGroupPage onCreated={onCreated} />)
    expect(screen.getByRole('button', { name: 'Create group' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Knitting' } })
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'posts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
    expect(createGroup).toHaveBeenCalledWith('Knitting', 'posts')
    await vi.waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new', name: 'Knitting' })),
    )
  })
})
