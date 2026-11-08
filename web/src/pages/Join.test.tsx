// @vitest-environment happy-dom
import { paragraph, renderWithQuery } from '../test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The join page shows the community: who invited the visitor, to which community, and what it is for. Joining asks
 * for no password, and the first sign-in email finishes joining (architecture.md, Accounts).
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getInvite: vi.fn(() => Promise.resolve({ invited_by: 'raphael', rules_html: '' })),
  register: vi.fn(() => Promise.resolve({ email: 'kit@example.test' })),
  changeJoiningAddress: vi.fn(() => Promise.resolve()),
  signinWithCode: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const community = {
  group_creation: 'anyone' as const,
  name: 'Knitting Circle',
  description: 'Wool and gossip.',
  owner_set: true,
}

describe('Join', () => {
  it('names the community and says what it is for', async () => {
    const { Join } = await import('./Join')
    render(<Join code="abc" community={community} onSignedIn={() => {}} />)
    await screen.findByText('raphael invited you to Knitting Circle.')
    expect(screen.getByText('Wool and gossip.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Join Knitting Circle' })).toBeTruthy()
    expect(screen.getAllByText('Knitting Circle').length).toBeGreaterThan(0)
    expect(screen.getByText('Made with Sweet')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('joins with a username and an address, then finishes with the code, and can fix a mistyped address', async () => {
    const { register, changeJoiningAddress, signinWithCode } = await import('../api')
    const { Join } = await import('./Join')
    vi.mocked(signinWithCode).mockResolvedValue({ user: { id: 'kit', username: 'kit', picture: null }, token: 't' })
    const onSignedIn = vi.fn()
    render(<Join code="abc" community={community} onSignedIn={onSignedIn} />)
    await screen.findByText('raphael invited you to Knitting Circle.')
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'kit' } })
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'kit@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join Knitting Circle' }))
    await screen.findByText('Check your email')
    expect(register).toHaveBeenCalledWith('abc', 'kit', 'kit@example.test')
    expect(screen.getByText('kit@example.test')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Use a different address' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'right@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to this address' }))
    await screen.findByText('right@example.test')
    expect(changeJoiningAddress).toHaveBeenCalledWith('right@example.test')

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Finish joining' }))
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalled())
  })

  it('shows the rules, and joining agrees to them', async () => {
    const { getInvite } = await import('../api')
    vi.mocked(getInvite).mockResolvedValue({ invited_by: 'raphael', rules_html: paragraph('Be kind.') })
    const { Join } = await import('./Join')
    renderWithQuery(<Join code="abc" community={community} onSignedIn={() => {}} />)
    await screen.findByText('Be kind.')
    expect(screen.getByRole('button', { name: 'Agree and join' })).toBeTruthy()
  })
})
