// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { ROOT, group, renderWithQuery } from '../test-utils'

/**
 * The Community page: the community's settings for the owner, and the topics for the owner and moderators.
 */
vi.mock('../api', () => ({
  listTopics: vi.fn(() => Promise.resolve({ topics: [] })),
  getRules: vi.fn(() => Promise.resolve({ body_html: '' })),
  getWelcome: vi.fn(() => Promise.resolve({ body_html: '' })),
  listReports: vi.fn(() => Promise.resolve({ reports: [] })),
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
  it('shows the current settings and saves them in one request', async () => {
    const { setSettings } = await import('../api')
    const { CommunityPage } = await import('./CommunityPage')
    renderWithQuery(<CommunityPage root={group(ROOT, 'owner')} />)
    const name = (await screen.findByLabelText('Community name')) as HTMLInputElement
    expect(name.value).toBe('Knitting Circle')
    expect((screen.getByLabelText('Short community description') as HTMLTextAreaElement).value).toBe('Wool.')
    fireEvent.change(screen.getByLabelText('Who can create rooms'), { target: { value: 'staff' } })
    fireEvent.change(name, { target: { value: ' Knitting ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(setSettings).toHaveBeenCalledWith({ name: 'Knitting', description: 'Wool.', group_creation: 'staff' })
    await screen.findByText('Saved.')
  })

  it('does not save without a name', async () => {
    const { setSettings } = await import('../api')
    const { CommunityPage } = await import('./CommunityPage')
    renderWithQuery(<CommunityPage root={group(ROOT, 'owner')} />)
    fireEvent.change(await screen.findByLabelText('Community name'), { target: { value: '  ' } })
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    expect(setSettings).not.toHaveBeenCalled()
  })

  it("marks the owner's own card as the owner's only", async () => {
    const { CommunityPage } = await import('./CommunityPage')
    renderWithQuery(<CommunityPage root={group(ROOT, 'owner')} />)
    await screen.findByRole('heading', { name: 'About this community' })
    expect(screen.getAllByRole('img', { name: 'Only the owner sees this' })).toHaveLength(1)
  })

  it('the owner sees the reports, the community settings, the welcome message, the rules and the topics', async () => {
    const { CommunityPage } = await import('./CommunityPage')
    renderWithQuery(<CommunityPage root={group(ROOT, 'owner')} />)
    await screen.findByRole('heading', { name: 'Topics' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Reports',
      'About this community',
      'Welcome message',
      'Rules',
      'Topics',
    ])
  })

  it('opens the welcome message in the editor when asked to', async () => {
    const { CommunityPage } = await import('./CommunityPage')
    renderWithQuery(<CommunityPage root={group(ROOT, 'owner')} editing="welcome" />)
    await screen.findByRole('heading', { name: 'Welcome message' })
    expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('a moderator sees the reports first, then the welcome message, rules and topics, and not the community settings', async () => {
    const { CommunityPage } = await import('./CommunityPage')
    renderWithQuery(<CommunityPage root={group(ROOT, 'moderator')} />)
    await screen.findByRole('heading', { name: 'Topics' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Reports',
      'Welcome message',
      'Rules',
      'Topics',
    ])
    // Each card is marked with the shield, and the page says once what the shield means.
    expect(screen.getAllByRole('img', { name: 'Only the owner and moderators see this' })).toHaveLength(4)
    expect(screen.getByText(/marks what only owners and moderators can see and do\./)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'About this community' })).toBeNull()
    expect(screen.queryByLabelText('Community name')).toBeNull()
  })
})
