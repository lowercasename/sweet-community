// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The setup link's page. The person holding the link sets up their account
 * with a username and an email address. There is no password, because a password is always the secondary way in.
 * A password can be added on Settings later.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  setup: vi.fn(() => Promise.resolve({ user: { id: 'raphael', username: 'raphael', picture: null }, token: 't' })),
}))

afterEach(cleanup)

describe('Setup', () => {
  it('sets up the account with a username and an email address, and asks for no password', async () => {
    const { setup } = await import('../api')
    const { Setup } = await import('./Setup')
    const onSetUp = vi.fn()
    render(<Setup token="tok" onSetUp={onSetUp} />)
    expect(screen.getByRole('heading', { name: 'Set up your account' })).toBeTruthy()
    expect(screen.getByText('Letters, numbers, and underscores.')).toBeTruthy()
    expect(screen.getByText('When you sign in later, a link and a code are sent here.')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: ' raphael ' } })
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'r@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set up' }))
    expect(setup).toHaveBeenCalledWith('tok', 'raphael', 'r@example.test')
    await vi.waitFor(() => expect(onSetUp).toHaveBeenCalled())
  })
})
