// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/** Signing in, and how an unverified email address affects it (architecture.md, Accounts). */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  login: vi.fn(),
  resendVerification: vi.fn(() => Promise.resolve()),
  changeUnverifiedEmail: vi.fn(() => Promise.resolve()),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const fill = () => {
  fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'kit' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Login', () => {
  it('a refused sign-in for an unverified address shows the address the link was sent to, with resend and change of address options', async () => {
    const { ApiError, login, resendVerification, changeUnverifiedEmail } = await import('../api')
    const { Login } = await import('./Login')
    vi.mocked(login).mockRejectedValue(new ApiError(403, 'unverified', { email: 'kit@example.test' }))
    const onSignedIn = vi.fn()
    render(<Login onSignedIn={onSignedIn} />)
    fill()
    await screen.findByText('Check your email')
    expect(screen.getByText('kit@example.test')).toBeTruthy()
    expect(onSignedIn).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Send it again' }))
    expect(resendVerification).toHaveBeenCalledWith('kit@example.test')
    await screen.findByText(/Sent again/)

    fireEvent.click(screen.getByRole('button', { name: 'Use a different address' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'right@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send the link there' }))
    expect(changeUnverifiedEmail).toHaveBeenCalledWith('kit', 'longenough', 'right@example.test')
    await screen.findByText('right@example.test')

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByLabelText('Username or email')).toBeTruthy()
  })

  it('a community with no owner yet has no sign-in form, only a message about the setup link', async () => {
    const { Login } = await import('./Login')
    render(
      <Login
        community={{ group_creation: 'anyone', name: '', description: '', owner_set: false }}
        onSignedIn={() => {}}
      />,
    )
    expect(screen.getByText(/has not been set up yet/)).toBeTruthy()
    expect(screen.queryByLabelText('Username or email')).toBeNull()
  })

  it('any other error is shown as the server sent it', async () => {
    const { ApiError, login } = await import('../api')
    const { Login } = await import('./Login')
    vi.mocked(login).mockRejectedValue(new ApiError(401, 'Wrong username or password'))
    render(<Login onSignedIn={() => {}} />)
    fill()
    await screen.findByText('Wrong username or password')
    expect(screen.queryByText('Check your email')).toBeNull()
  })
})
