// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { Account } from '../api'
import { keys } from '../data/keys'
import { renderWithQuery } from '../test-utils'

/**
 * The account card. A password is optional. Settings sets one, changes it or removes it,
 * and none of these asks for the current password. A new email address needs no password either.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getAccount: vi.fn(),
  setPassword: vi.fn(() => Promise.resolve()),
  removePassword: vi.fn(() => Promise.resolve()),
  changeEmail: vi.fn(),
  setUsername: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const account = (extra: Partial<Account> = {}): Account => ({
  email: 'kit@example.test',
  email_verified: true,
  pending_email: null,
  has_password: false,
  ...extra,
})

describe('AccountCard', () => {
  it('shows the username and changes it', async () => {
    const { setUsername } = await import('../api')
    vi.mocked(setUsername).mockResolvedValue({ id: 'kit', username: 'kat', picture: null })
    const { AccountCard } = await import('./AccountCard')
    renderWithQuery(<AccountCard username="kit" />, (qc) => qc.setQueryData(keys.account, account()))
    expect(screen.getByRole('heading', { name: 'Username' })).toBeTruthy()
    expect(screen.getByText('kit')).toBeTruthy()
    const field = screen.getByLabelText('New username') as HTMLInputElement
    const change = screen.getByRole('button', { name: 'Change username' }) as HTMLButtonElement
    // The same name would change nothing.
    fireEvent.change(field, { target: { value: 'kit' } })
    expect(change.disabled).toBe(true)
    fireEvent.change(field, { target: { value: ' kat ' } })
    fireEvent.click(change)
    await vi.waitFor(() => expect(field.value).toBe(''))
    expect(setUsername).toHaveBeenCalledWith('kat')
  })

  it("shows the server's reason when a username cannot be changed", async () => {
    const { setUsername } = await import('../api')
    vi.mocked(setUsername).mockRejectedValue(new Error('That username is taken'))
    const { AccountCard } = await import('./AccountCard')
    renderWithQuery(<AccountCard username="kit" />, (qc) => qc.setQueryData(keys.account, account()))
    fireEvent.change(screen.getByLabelText('New username'), { target: { value: 'jo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change username' }))
    await screen.findByText('That username is taken')
  })

  it('an account without a password says how it signs in and offers Set password', async () => {
    const { setPassword } = await import('../api')
    const { AccountCard } = await import('./AccountCard')
    renderWithQuery(<AccountCard username="kit" />, (qc) => qc.setQueryData(keys.account, account()))
    expect(screen.getByText(/You sign in by email/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove password' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))
    await vi.waitFor(() => expect(setPassword).toHaveBeenCalledWith('longenough'))
  })

  it('an account with a password offers Change password and Remove password, which confirms first', async () => {
    const { getAccount, setPassword, removePassword } = await import('../api')
    const { AccountCard } = await import('./AccountCard')
    vi.mocked(getAccount).mockResolvedValue(account({ has_password: true }))
    renderWithQuery(<AccountCard username="kit" />, (qc) =>
      qc.setQueryData(keys.account, account({ has_password: true })),
    )
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'anotherlongone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await screen.findByText(/Password changed/)
    expect(setPassword).toHaveBeenCalledWith('anotherlongone')

    fireEvent.click(screen.getByRole('button', { name: 'Remove password' }))
    const dialog = await screen.findByRole('dialog', { hidden: true })
    expect(removePassword).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove password' }))
    await vi.waitFor(() => expect(removePassword).toHaveBeenCalled())
  })

  it('a new email address needs no password', async () => {
    const { changeEmail } = await import('../api')
    const { AccountCard } = await import('./AccountCard')
    vi.mocked(changeEmail).mockResolvedValue(account({ pending_email: 'new@example.test' }))
    renderWithQuery(<AccountCard username="kit" />, (qc) => qc.setQueryData(keys.account, account()))
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }))
    await screen.findByText(/new@example.test/)
    expect(changeEmail).toHaveBeenCalledWith('new@example.test')
  })
})
