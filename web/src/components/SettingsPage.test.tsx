// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, group, renderWithQuery, user } from '../test-utils'

/** The instance's settings live on the Settings page, for the root owner only. */
vi.mock('../api', () => ({
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  getSettings: vi.fn(() => Promise.resolve({ group_creation: 'anyone' })),
  setSettings: vi.fn((s: { group_creation: string }) => Promise.resolve(s)),
  logoutEverywhere: vi.fn(),
  uploadImage: vi.fn(),
  setPicture: vi.fn(),
  removeUser: vi.fn(() => Promise.resolve()),
  getAccount: vi.fn(() => Promise.resolve({ email: 'kit@example.test', email_verified: true, pending_email: null })),
  changeEmail: vi.fn((email: string) =>
    Promise.resolve({ email: 'kit@example.test', email_verified: true, pending_email: email }),
  ),
  changePassword: vi.fn(() => Promise.resolve()),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('SettingsPage', () => {
  it('lets the root owner choose who may create groups', async () => {
    const { setSettings } = await import('../api')
    const { SettingsPage } = await import('./SettingsPage')
    renderWithQuery(<SettingsPage me={user('raphael')} root={group(ROOT, 'owner')} onSignOut={() => {}} />)
    const picker = await screen.findByLabelText('Who can create rooms')
    expect((picker as HTMLSelectElement).value).toBe('anyone')
    fireEvent.change(picker, { target: { value: 'staff' } })
    expect(setSettings).toHaveBeenCalledWith({ group_creation: 'staff' })
  })

  it('lets anyone but the owner remove their account, after a confirm; the owner hands over first', async () => {
    const { removeUser } = await import('../api')
    const { SettingsPage } = await import('./SettingsPage')
    const { qc } = renderWithQuery(
      <SettingsPage me={user('kit')} root={group(ROOT, 'moderator')} onSignOut={() => {}} />,
      (c) => c.setQueryData(['me'], user('kit')),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Remove my account' }))
    expect(removeUser).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Remove' }))
    expect(removeUser).toHaveBeenCalledWith('kit')
    await vi.waitFor(() => expect(qc.getQueryData(['me'])).toBeNull())
    cleanup()
    renderWithQuery(<SettingsPage me={user('raphael')} root={group(ROOT, 'owner')} onSignOut={() => {}} />)
    await screen.findByText('You run this community. Hand it over to someone else first.')
    expect(screen.queryByRole('button', { name: 'Remove my account' })).toBeNull()
  })

  it('shows my address; a new one waits as pending once its link is sent; a new password wants the old', async () => {
    const { changeEmail, changePassword } = await import('../api')
    const { SettingsPage } = await import('./SettingsPage')
    renderWithQuery(<SettingsPage me={user('kit')} root={group(ROOT, 'member')} onSignOut={() => {}} />)
    await screen.findByText('kit@example.test')
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send a link there' }))
    expect(changeEmail).toHaveBeenCalledWith('new@example.test', 'longenough')
    await screen.findByText(/A link is on its way to new@example.test/)
    // The old address stands until then.
    expect(screen.getByText('kit@example.test')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'anotherlongone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(changePassword).toHaveBeenCalledWith('longenough', 'anotherlongone')
    await screen.findByText(/Password changed/)
  })

  it('shows nobody else the instance settings', async () => {
    const { getSettings } = await import('../api')
    const { SettingsPage } = await import('./SettingsPage')
    renderWithQuery(<SettingsPage me={user('kit')} root={group(ROOT, 'moderator')} onSignOut={() => {}} />)
    await screen.findByText('Profile picture')
    expect(screen.queryByLabelText('Who can create rooms')).toBeNull()
    expect(getSettings).not.toHaveBeenCalled()
  })
})
