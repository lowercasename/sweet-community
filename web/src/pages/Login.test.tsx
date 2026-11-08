// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/** Signing in by email, with a password as the other way (architecture.md, Accounts). */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  login: vi.fn(),
  requestSignin: vi.fn(() => Promise.resolve()),
  signinWithCode: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const kit = { id: 'kit', username: 'kit', picture: null }

describe('Login', () => {
  it('sends a sign-in email for a username, then signs in with the code from it', async () => {
    const { requestSignin, signinWithCode } = await import('../api')
    const { Login } = await import('./Login')
    vi.mocked(signinWithCode).mockResolvedValue({ user: kit, token: 't' })
    const onSignedIn = vi.fn()
    render(<Login onSignedIn={onSignedIn} />)
    expect(screen.queryByLabelText('Password')).toBeNull()
    fireEvent.change(screen.getByLabelText('Username or email address'), { target: { value: ' kit ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send a sign-in email' }))
    await screen.findByText('Check your email')
    expect(requestSignin).toHaveBeenCalledWith('kit')

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123 456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(kit))
    expect(signinWithCode).toHaveBeenCalledWith('123 456')
  })

  it('a wrong code shows the server message, and Send another email asks again', async () => {
    const { ApiError, requestSignin, signinWithCode } = await import('../api')
    const { Login } = await import('./Login')
    vi.mocked(signinWithCode).mockRejectedValue(new ApiError(400, 'That code is wrong or has expired'))
    render(<Login onSignedIn={() => {}} />)
    fireEvent.change(screen.getByLabelText('Username or email address'), { target: { value: 'kit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send a sign-in email' }))
    await screen.findByText('Check your email')
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('That code is wrong or has expired')

    fireEvent.click(screen.getByRole('button', { name: 'Send another email' }))
    await screen.findByText(/Sent again/)
    expect(requestSignin).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByLabelText('Username or email address')).toBeTruthy()
  })

  it('signs in with a password, and an unverified account is sent a sign-in email instead', async () => {
    const { ApiError, login, requestSignin } = await import('../api')
    const { Login } = await import('./Login')
    vi.mocked(login).mockRejectedValue(new ApiError(403, 'unverified', { email: 'kit@example.test' }))
    const onSignedIn = vi.fn()
    render(<Login onSignedIn={onSignedIn} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use a password instead' }))
    fireEvent.change(screen.getByLabelText('Username or email address'), { target: { value: 'kit' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Check your email')
    expect(login).toHaveBeenCalledWith('kit', 'longenough')
    expect(requestSignin).toHaveBeenCalledWith('kit')
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('a wrong password is shown as the server sent it, and the email way is one click back', async () => {
    const { ApiError, login } = await import('../api')
    const { Login } = await import('./Login')
    vi.mocked(login).mockRejectedValue(new ApiError(401, 'Wrong username or password'))
    render(<Login onSignedIn={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use a password instead' }))
    fireEvent.change(screen.getByLabelText('Username or email address'), { target: { value: 'kit' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Wrong username or password')
    fireEvent.click(screen.getByRole('button', { name: 'Use a sign-in email instead' }))
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send a sign-in email' })).toBeTruthy()
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
    expect(screen.queryByLabelText('Username or email address')).toBeNull()
  })
})
