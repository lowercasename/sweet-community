// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { keys } from '../data/keys'
import { renderWithQuery, paragraph } from '../test-utils'

/**
 * The Rules card and the Welcome message card on the Community page, for the owner
 * and moderators. Both are the same card with different words.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getRules: vi.fn(() => Promise.resolve({ body_html: '' })),
  setRules: vi.fn((html: string) => Promise.resolve({ body_html: html })),
  getWelcome: vi.fn(() => Promise.resolve({ body_html: '' })),
  setWelcome: vi.fn((html: string) => Promise.resolve({ body_html: html })),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('RulesCard', () => {
  it('shows the rules, and Edit rules opens the editor', async () => {
    const { RulesCard } = await import('./CommunityTextCard')
    renderWithQuery(<RulesCard />, (qc) => qc.setQueryData(keys.rules, { body_html: paragraph('Be kind.') }))
    await screen.findByText('Be kind.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit rules' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('offers Write rules when there are none', async () => {
    const { RulesCard } = await import('./CommunityTextCard')
    renderWithQuery(<RulesCard />, (qc) => qc.setQueryData(keys.rules, { body_html: '' }))
    await screen.findByRole('button', { name: 'Write rules' })
    expect(screen.getByText(/no rules yet/)).toBeTruthy()
  })
})

describe('WelcomeCard', () => {
  it('shows the welcome message under its heading, and Edit welcome message opens the editor', async () => {
    const { WelcomeCard } = await import('./CommunityTextCard')
    renderWithQuery(<WelcomeCard />, (qc) =>
      qc.setQueryData(keys.welcome, { body_html: paragraph('Say hello in Introductions.') }),
    )
    await screen.findByText('Say hello in Introductions.')
    expect(screen.getByRole('heading', { name: 'Welcome message' })).toBeTruthy()
    expect(screen.getByText(/Everyone who joins sees this when they first open/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit welcome message' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('offers Write welcome message when there is none', async () => {
    const { WelcomeCard } = await import('./CommunityTextCard')
    renderWithQuery(<WelcomeCard />, (qc) => qc.setQueryData(keys.welcome, { body_html: '' }))
    await screen.findByRole('button', { name: 'Write welcome message' })
    expect(screen.getByText('This community has no welcome message yet.')).toBeTruthy()
  })

  it('opens in the editor when the tour sends the owner to write it', async () => {
    const { WelcomeCard } = await import('./CommunityTextCard')
    renderWithQuery(<WelcomeCard editing />, (qc) => qc.setQueryData(keys.welcome, { body_html: '' }))
    await screen.findByRole('button', { name: 'Save' })
    expect(screen.queryByRole('button', { name: 'Write welcome message' })).toBeNull()
  })
})
