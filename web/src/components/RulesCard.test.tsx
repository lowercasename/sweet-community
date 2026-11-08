// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { keys } from '../data/keys'
import { renderWithQuery, paragraph } from '../test-utils'

/** The Rules card on the Community page (architecture.md, Admin tools), for the owner and moderators. */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getRules: vi.fn(() => Promise.resolve({ body_html: '' })),
  setRules: vi.fn((html: string) => Promise.resolve({ body_html: html })),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('RulesCard', () => {
  it('shows the rules, and Edit rules opens the editor', async () => {
    const { RulesCard } = await import('./RulesCard')
    renderWithQuery(<RulesCard />, (qc) => qc.setQueryData(keys.rules, { body_html: paragraph('Be kind.') }))
    await screen.findByText('Be kind.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit rules' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('offers Write rules when there are none', async () => {
    const { RulesCard } = await import('./RulesCard')
    renderWithQuery(<RulesCard />, (qc) => qc.setQueryData(keys.rules, { body_html: '' }))
    await screen.findByRole('button', { name: 'Write rules' })
    expect(screen.getByText(/no rules yet/)).toBeTruthy()
  })
})
