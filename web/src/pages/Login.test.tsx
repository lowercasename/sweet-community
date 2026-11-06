// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/** Signing in, and what an unverified address does to it (architecture.md, Accounts). */
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
  it('a refused sign-in for an unverified address shows where the link went, with resend and a change of address', async () => {
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

  it('any other refusal is shown as it came', async () => {
    const { ApiError, login } = await import('../api')
    const { Login } = await import('./Login')
    vi.mocked(login).mockRejectedValue(new ApiError(401, 'wrong username or password'))
    render(<Login onSignedIn={() => {}} />)
    fill()
    await screen.findByText('wrong username or password')
    expect(screen.queryByText('Check your email')).toBeNull()
  })
})
