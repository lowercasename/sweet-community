// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { embedParagraph, member, mentionSpan, paragraph, renderWithQuery } from '../test-utils'

/** A body's mentions show the mentioned users' current names and link to their profiles through the app's router. */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [member('kit')] })),
  getLinkPreview: vi.fn((url: string) =>
    Promise.resolve(
      url.endsWith('/open-day') ? { url, title: 'Open day', description: 'Bring a trowel.', image: null } : null,
    ),
  ),
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

  it('draws a link preview card inside its paragraph, and leaves a link with no preview as a plain link', async () => {
    const { Body } = await import('./Body')
    renderWithQuery(
      <Body html={embedParagraph('https://plots.test/open-day') + embedParagraph('https://plots.test/nothing')} />,
    )
    const card = await screen.findByRole('link', { name: /Open day/ })
    expect(card.getAttribute('href')).toBe('https://plots.test/open-day')
    expect(card.getAttribute('target')).toBe('_blank')
    expect(card.textContent).toContain('Bring a trowel.')
    // The card shows the page's domain, read from the link.
    expect(card.textContent).toContain('plots.test')
    expect(card.closest('p[data-embed]')).not.toBeNull()
    // The page with no preview keeps its plain link, and no card is drawn for it.
    expect(screen.getByRole('link', { name: 'https://plots.test/nothing' })).toBeTruthy()
    expect(document.querySelectorAll('.link-preview')).toHaveLength(1)
  })
})
