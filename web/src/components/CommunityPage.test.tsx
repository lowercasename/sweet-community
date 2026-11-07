// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithQuery } from '../test-utils'

/** The owner's page for the community: name, what it is for, who may make rooms. */
vi.mock('../api', () => ({
  getSettings: vi.fn(() =>
    Promise.resolve({ group_creation: 'anyone', name: 'Knitting Circle', description: 'Wool.', owner_set: true }),
  ),
  setSettings: vi.fn((s: { name: string; description: string; group_creation: string }) =>
    Promise.resolve({ ...s, owner_set: true }),
  ),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('CommunityPage', () => {
  it('shows the settings as they are and saves them together', async () => {
    const { setSettings } = await import('../api')
    const { CommunityPage } = await import('./CommunityPage')
    renderWithQuery(<CommunityPage />)
    const name = (await screen.findByLabelText('Community name')) as HTMLInputElement
    expect(name.value).toBe('Knitting Circle')
    expect((screen.getByLabelText('Short community description') as HTMLTextAreaElement).value).toBe('Wool.')
    fireEvent.change(screen.getByLabelText('Who can create rooms'), { target: { value: 'staff' } })
    fireEvent.change(name, { target: { value: ' Knitting ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(setSettings).toHaveBeenCalledWith({ name: 'Knitting', description: 'Wool.', group_creation: 'staff' })
    await screen.findByText('Saved.')
  })

  it('will not save without a name', async () => {
    const { setSettings } = await import('../api')
    const { CommunityPage } = await import('./CommunityPage')
    renderWithQuery(<CommunityPage />)
    fireEvent.change(await screen.findByLabelText('Community name'), { target: { value: '  ' } })
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    expect(setSettings).not.toHaveBeenCalled()
  })
})
