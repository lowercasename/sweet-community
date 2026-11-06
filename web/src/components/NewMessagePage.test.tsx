// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { dm, member, renderWithQuery, user } from '../test-utils'

/** New message takes one person and opens the conversation with them: the one that exists, or a new one. */
vi.mock('../api', () => ({
  listUsers: vi.fn(),
  openDM: vi.fn(),
}))

afterEach(cleanup)

beforeEach(async () => {
  const { listUsers, openDM } = await import('../api')
  vi.mocked(listUsers).mockResolvedValue({ users: [member('raphael', 'owner'), member('kit'), member('mo')] })
  vi.mocked(openDM).mockResolvedValue(dm('d1', [user('kit'), user('raphael')]))
})

describe('NewMessagePage', () => {
  it('offers everyone but me, one at a time, and starts with the one chosen', async () => {
    const { openDM } = await import('../api')
    const { NewMessagePage } = await import('./NewMessagePage')
    const onOpened = vi.fn()
    renderWithQuery(<NewMessagePage me={user('raphael')} onOpened={onOpened} />)
    const picker = await screen.findByLabelText('To')
    await within(picker).findByText('kit')
    expect(within(picker).queryByText('raphael')).toBeNull()
    expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', true)
    fireEvent.change(picker, { target: { value: 'kit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(openDM).toHaveBeenCalledWith('kit')
    await vi.waitFor(() => expect(onOpened).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' })))
  })
})
