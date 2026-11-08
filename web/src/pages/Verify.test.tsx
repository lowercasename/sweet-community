// @vitest-environment happy-dom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/** The verification link's page. The token is used once, on arrival. */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(() => Promise.resolve()),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('Verify', () => {
  it('uses the token once, even under strict mode, and calls onVerified with the user', async () => {
    const { verifyEmail } = await import('../api')
    const { Verify } = await import('./Verify')
    vi.mocked(verifyEmail).mockResolvedValue({ user: { id: 'kit', username: 'kit', picture: null }, token: 't' })
    const onVerified = vi.fn()
    render(
      <StrictMode>
        <Verify token="abc" onVerified={onVerified} />
      </StrictMode>,
    )
    await vi.waitFor(() => expect(onVerified).toHaveBeenCalledWith({ id: 'kit', username: 'kit', picture: null }))
    expect(verifyEmail).toHaveBeenCalledTimes(1)
    expect(verifyEmail).toHaveBeenCalledWith('abc')
  })

  it('an invalid link shows an error and offers a new one', async () => {
    const { ApiError, verifyEmail, resendVerification } = await import('../api')
    const { Verify } = await import('./Verify')
    vi.mocked(verifyEmail).mockRejectedValue(new ApiError(404, 'This link has been used or has expired'))
    render(<Verify token="old" onVerified={() => {}} />)
    await screen.findByText('This link does not work')
    fireEvent.change(screen.getByLabelText('Send a new link to'), { target: { value: 'kit@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }))
    expect(resendVerification).toHaveBeenCalledWith('kit@example.test')
    await screen.findByText(/a new link has been sent/)
  })
})
