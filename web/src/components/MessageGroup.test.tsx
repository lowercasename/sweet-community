// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { message, nobody, renderWithQuery, user } from '../test-utils'

/** A chat message offers Delete only when its can flag allows it, and asks for confirmation first. */
vi.mock('../api', () => ({
  getMe: vi.fn(() => Promise.resolve({ id: 'kit', username: 'kit', picture: null })),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

afterEach(cleanup)

describe('MessageGroup', () => {
  it('offers Delete only on messages the server allows, and confirms before deleting', async () => {
    const { MessageGroup } = await import('./MessageGroup')
    const onDelete = vi.fn(() => Promise.resolve())
    renderWithQuery(
      <MessageGroup
        messages={[
          message('m1', user('mo'), { can: { edit: false, delete: true } }),
          message('m2', user('mo'), { can: nobody }),
        ]}
        onDelete={onDelete}
      />,
    )
    expect(screen.getAllByLabelText('Message options')).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('Message options'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('m1')
  })
})
