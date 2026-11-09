// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The page a sign-in link opens. Email security scanners open links, so the token is used
 * only when Finish signing in is pressed.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  signinWithLink: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('SigninLink', () => {
  it('uses the token only when the button is pressed, and signs in', async () => {
    const { signinWithLink } = await import('../api')
    const { SigninLink } = await import('./SigninLink')
    const kit = { id: 'kit', username: 'kit', picture: null }
    vi.mocked(signinWithLink).mockResolvedValue({ user: kit, token: 't' })
    const onSignedIn = vi.fn()
    render(<SigninLink token="abc" name="Knitting Circle" onSignedIn={onSignedIn} />)
    expect(signinWithLink).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Finish signing in' }))
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(kit))
    expect(signinWithLink).toHaveBeenCalledWith('abc')
  })

  it('a used or expired link says so and leads back to sign in', async () => {
    const { ApiError, signinWithLink } = await import('../api')
    const { SigninLink } = await import('./SigninLink')
    vi.mocked(signinWithLink).mockRejectedValue(new ApiError(404, 'This link has been used or has expired'))
    render(<SigninLink token="old" onSignedIn={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Finish signing in' }))
    await screen.findByText('This link has been used or has expired')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeTruthy()
  })
})
