// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, group, renderWithQuery, user } from '../test-utils'

/**
 * The user's own settings: picture, account, sign out and account removal.
 * Community settings are on the Community page.
 */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  logoutEverywhere: vi.fn(),
  uploadImage: vi.fn(),
  setPicture: vi.fn(),
  removeUser: vi.fn(() => Promise.resolve()),
  getAccount: vi.fn(() => Promise.resolve({ email: 'kit@example.test', email_verified: true, pending_email: null })),
  changeEmail: vi.fn((email: string) =>
    Promise.resolve({ email: 'kit@example.test', email_verified: true, pending_email: email }),
  ),
  changePassword: vi.fn(() => Promise.resolve()),
  getMySettings: vi.fn(() => Promise.resolve({ digest: 'weekly' })),
  setMySettings: vi.fn(),
  getPushKey: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('SettingsPage', () => {
  it('lets a non-owner remove their account after confirming, and asks the owner to transfer ownership', async () => {
    const { removeUser } = await import('../api')
    const { SettingsPage } = await import('./SettingsPage')
    const { qc } = renderWithQuery(
      <SettingsPage me={user('kit')} root={group(ROOT, 'moderator')} onSignOut={() => {}} />,
      (c) => c.setQueryData(['me'], user('kit')),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Remove my account' }))
    expect(removeUser).not.toHaveBeenCalled()
    fireEvent.click(
      within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Remove my account' }),
    )
    expect(removeUser).toHaveBeenCalledWith('kit')
    await vi.waitFor(() => expect(qc.getQueryData(['me'])).toBeNull())
    cleanup()
    renderWithQuery(<SettingsPage me={user('raphael')} root={group(ROOT, 'owner')} onSignOut={() => {}} />)
    await screen.findByText('You run this community. Hand it over to someone else before you leave.')
    expect(screen.queryByRole('button', { name: 'Remove my account' })).toBeNull()
  })

  it('shows the email, keeps a new one pending once its link is sent, and a new password needs the old', async () => {
    const { changeEmail, changePassword } = await import('../api')
    const { SettingsPage } = await import('./SettingsPage')
    renderWithQuery(<SettingsPage me={user('kit')} root={group(ROOT, 'member')} onSignOut={() => {}} />)
    await screen.findByText('kit@example.test')
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }))
    expect(changeEmail).toHaveBeenCalledWith('new@example.test', 'longenough')
    await screen.findByText(/A link has been sent to new@example.test/)
    // The old address stays in use until the link is opened.
    expect(screen.getByText('kit@example.test')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'anotherlongone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(changePassword).toHaveBeenCalledWith('longenough', 'anotherlongone')
    await screen.findByText(/Password changed/)
  })
})
