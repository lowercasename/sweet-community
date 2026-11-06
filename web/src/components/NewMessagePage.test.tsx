// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { dm, member, renderWithQuery, user } from '../test-utils'

/** New message takes any number of people and opens the conversation of exactly them: the one that exists, or a new one. */
vi.mock('../api', () => ({
  listUsers: vi.fn(),
  openDM: vi.fn(),
}))

afterEach(cleanup)

beforeEach(async () => {
  const { listUsers, openDM } = await import('../api')
  vi.mocked(listUsers).mockResolvedValue({
    users: [member('raphael', 'owner'), member('kit'), member('mo'), member('jo'), member('al')],
  })
  vi.mocked(openDM).mockResolvedValue(dm('d1', [user('kit'), user('mo'), user('raphael')]))
})

describe('NewMessagePage', () => {
  it('gathers people, never me, lets one go again, and starts with exactly those chosen', async () => {
    const { openDM } = await import('../api')
    const { NewMessagePage } = await import('./NewMessagePage')
    const onOpened = vi.fn()
    renderWithQuery(<NewMessagePage me={user('raphael')} onOpened={onOpened} />)
    const picker = await screen.findByLabelText('Add someone')
    await within(picker).findByText('kit')
    expect(within(picker).queryByText('raphael')).toBeNull()
    expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', true)
    fireEvent.change(picker, { target: { value: 'kit' } })
    fireEvent.change(screen.getByLabelText('Add someone'), { target: { value: 'mo' } })
    fireEvent.change(screen.getByLabelText('Add someone'), { target: { value: 'jo' } })
    // Chosen people leave the picker; one can be let go.
    expect(within(screen.getByLabelText('Add someone')).queryByText('kit')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove jo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(openDM).toHaveBeenCalledWith(['kit', 'mo'])
    await vi.waitFor(() => expect(onOpened).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' })))
  })

  it('starts from the people it is given, a conversation’s own', async () => {
    const { NewMessagePage } = await import('./NewMessagePage')
    renderWithQuery(<NewMessagePage me={user('raphael')} initial={['kit', 'mo']} onOpened={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Remove kit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove mo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', false)
  })
})
