// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { member, mentionSpan, paragraph, renderWithQuery } from '../test-utils'

/** A body's mentions show the mentioned users' current names and link to their profiles through the app's router. */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [member('kit')] })),
}))

afterEach(cleanup)

describe('Body', () => {
  it('shows a mention with the current name of the user and routes a click to their profile', async () => {
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
