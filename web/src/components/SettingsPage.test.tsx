// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { ROOT, group, renderWithQuery, user } from '../test-utils'

/** The instance's settings live on the Settings page, for the root owner only. */
vi.mock('../api', () => ({
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  getSettings: vi.fn(() => Promise.resolve({ group_creation: 'anyone' })),
  setSettings: vi.fn((s: { group_creation: string }) => Promise.resolve(s)),
  logoutEverywhere: vi.fn(),
  uploadImage: vi.fn(),
  setPicture: vi.fn(),
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

  it('shows nobody else the instance settings', async () => {
    const { getSettings } = await import('../api')
    const { SettingsPage } = await import('./SettingsPage')
    renderWithQuery(<SettingsPage me={user('kit')} root={group(ROOT, 'moderator')} onSignOut={() => {}} />)
    await screen.findByText('Profile picture')
    expect(screen.queryByLabelText('Who can create rooms')).toBeNull()
    expect(getSettings).not.toHaveBeenCalled()
  })
})
