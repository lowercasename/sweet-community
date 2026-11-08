// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { member, mentionSpan, paragraph, renderWithQuery } from '../test-utils'

/** A body's mentions wear their people's current names and lead to their pages, in the app. */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [member('kit')] })),
}))

afterEach(cleanup)

describe('Body', () => {
  it('names a mention as the person is now and routes a click to their page', async () => {
    const { Body } = await import('./Body')
    const { listUsers } = await import('../api')
    vi.mocked(listUsers).mockResolvedValue({ users: [{ ...member('kit'), username: 'kitten' }] })
    window.history.replaceState(null, '', '/')
    renderWithQuery(<Body html={paragraph(`hi ${mentionSpan('kit', 'kit')}`)} />)
    const link = await screen.findByRole('link', { name: '@kitten' })
    expect(link.getAttribute('href')).toBe('/u/kitten')
    fireEvent.click(link)
    expect(window.location.pathname).toBe('/u/kitten')
  })
})
