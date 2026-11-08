// @vitest-environment happy-dom
import { afterEach, describe, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { keys } from '../data/keys'
import { renderWithQuery, paragraph } from '../test-utils'

/** The rules page, opened from the Rules button on Home (architecture.md, Admin tools). */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getRules: vi.fn(() => Promise.resolve({ body_html: '' })),
}))

afterEach(cleanup)

describe('RulesPage', () => {
  it('shows the rules, or says there are none', async () => {
    const { RulesPage } = await import('./RulesPage')
    renderWithQuery(<RulesPage />, (qc) => qc.setQueryData(keys.rules, { body_html: paragraph('Be kind.') }))
    await screen.findByText('Be kind.')
    cleanup()
    renderWithQuery(<RulesPage />, (qc) => qc.setQueryData(keys.rules, { body_html: '' }))
    await screen.findByText('This community has no rules yet.')
  })
})
