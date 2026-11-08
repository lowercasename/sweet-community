// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The page a link to confirm a changed address opens (architecture.md, Accounts). Email security scanners open links,
 * so the token is used only when Confirm address is pressed. Confirming signs nobody in.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  confirmEmail: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('Verify', () => {
  it('uses the token only when the button is pressed, then says what the address is now', async () => {
    const { confirmEmail } = await import('../api')
    const { Verify } = await import('./Verify')
    vi.mocked(confirmEmail).mockResolvedValue({ email: 'new@example.test' })
    render(<Verify token="abc" signedIn={false} />)
    expect(confirmEmail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }))
    await screen.findByText('Your email address is now new@example.test.')
    expect(confirmEmail).toHaveBeenCalledWith('abc')
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy()
  })

  it('a used or expired link shows the server message', async () => {
    const { ApiError, confirmEmail } = await import('../api')
    const { Verify } = await import('./Verify')
    vi.mocked(confirmEmail).mockRejectedValue(new ApiError(404, 'This link has been used or has expired'))
    render(<Verify token="old" signedIn />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }))
    await screen.findByText('This link has been used or has expired')
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toBeTruthy()
  })
})
