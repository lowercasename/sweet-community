// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithQuery } from '../test-utils'

/** Onboarding. The owner names the community, then gets an invite link for the first users. */
vi.mock('../api', () => ({
  getSettings: vi.fn(() => Promise.resolve({ group_creation: 'anyone', name: '', description: '', owner_set: true })),
  setSettings: vi.fn((s: { name: string; description: string; group_creation: string }) =>
    Promise.resolve({ ...s, owner_set: true }),
  ),
  listInvites: vi.fn(() => Promise.resolve({ invites: [] })),
  createInvite: vi.fn(() =>
    Promise.resolve({
      code: 'abc',
      url: '/join/abc',
      created_by: { id: 'raphael', username: 'raphael', picture: null },
      created_at: 1,
      expires_at: 2,
      uses: 0,
    }),
  ),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const unnamed = { group_creation: 'anyone' as const, name: '', description: '', owner_set: true }

describe('Welcome', () => {
  it('asks for the name first, then offers an invite link, then goes to the community', async () => {
    const { setSettings, createInvite } = await import('../api')
    const { Welcome } = await import('./Welcome')
    const onDone = vi.fn()
    const { qc } = renderWithQuery(<Welcome settings={unnamed} onDone={onDone} />)
    // The page also reads the live settings query. Wait for that first read to complete before saving over it.
    await vi.waitFor(() => expect(qc.getQueryData(['settings'])).toBeTruthy())
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Community name'), { target: { value: 'Knitting Circle' } })
    fireEvent.change(screen.getByLabelText('Short community description'), { target: { value: 'Wool.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(setSettings).toHaveBeenCalledWith({
      name: 'Knitting Circle',
      description: 'Wool.',
      group_creation: 'anyone',
    })
    await screen.findByText('Invite people')
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }))
    expect(createInvite).toHaveBeenCalled()
    const field = (await screen.findByLabelText('Invite link')) as HTMLInputElement
    expect(field.value).toMatch(/\/join\/abc$/)
    fireEvent.click(await screen.findByRole('button', { name: 'Go to Knitting Circle' }))
    expect(onDone).toHaveBeenCalled()
  })
})
