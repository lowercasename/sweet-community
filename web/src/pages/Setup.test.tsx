// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The setup link's page, the first of three setup steps. It says where the new community is and what the owner's
 * account is. The person holding the link creates their account with a username and an email address. There is no
 * password, because a password is always the secondary way in. A password can be added on Settings later.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  setup: vi.fn(() => Promise.resolve({ user: { id: 'raphael', username: 'raphael', picture: null }, token: 't' })),
}))

afterEach(cleanup)

describe('Setup', () => {
  it('creates the account with a username and an email address, and asks for no password', async () => {
    const { setup } = await import('../api')
    const { Setup } = await import('./Setup')
    const onSetUp = vi.fn()
    render(<Setup token="tok" onSetUp={onSetUp} />)
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy()
    expect(screen.getByText('1 of 3')).toBeTruthy()
    // The community has no name yet, so the page names its address.
    expect(
      screen.getByText('You are setting up a new Sweet community at localhost:3000.', { exact: false }),
    ).toBeTruthy()
    expect(screen.getByText("You will also be the community's owner.", { exact: false })).toBeTruthy()
    expect(
      screen.getByText('Shown next to your posts and messages. You can use letters, numbers, and underscores.'),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Sweet signs you in by email, so there is no password to remember. You can add one in Settings later.',
      ),
    ).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: ' raphael ' } })
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'r@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(setup).toHaveBeenCalledWith('tok', 'raphael', 'r@example.test')
    await vi.waitFor(() => expect(onSetUp).toHaveBeenCalled())
  })
})
