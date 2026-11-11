// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, group, renderWithQuery, user } from '../test-utils'
import type { Hit } from '../api'

/**
 * The search page. The query is stored in the URL.
 * Each hit shows its kind, location and author, with the matches in bold.
 */
vi.mock('../api', () => ({
  search: vi.fn(),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

const kit = user('kit')
const hit = (kind: Hit['kind'], id: string, extra: Partial<Hit> = {}): Hit => ({
  kind,
  id,
  group_id: ROOT,
  post_id: kind === 'message' ? null : 'p1',
  author: kit,
  created_at: 5,
  excerpt: 'the \x01marmalade\x02 is ready',
  ...extra,
})

afterEach(cleanup)

beforeEach(async () => {
  const { search } = await import('../api')
  vi.mocked(search).mockResolvedValue({
    hits: [hit('post', 'p1'), hit('comment', 'c1'), hit('message', 'm1', { group_id: 'knit' })],
  })
})

async function draw(query: string) {
  const { SearchPage } = await import('./SearchPage')
  const onGo = vi.fn()
  renderWithQuery(
    <SearchPage
      query={query}
      groups={[group(ROOT, 'member'), group('knit', 'member', { name: 'Knitting' })]}
      onGo={onGo}
    />,
  )
  return onGo
}

describe('SearchPage', () => {
  it('sends no request until a query is entered, then puts the query in the URL', async () => {
    const { search } = await import('../api')
    const onGo = await draw('')
    expect(search).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: ' marmalade ' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Search' }).closest('form')!)
    expect(onGo).toHaveBeenCalledWith('/search?q=marmalade')
  })

  it('takes at most 200 characters, the most the server accepts', async () => {
    await draw('')
    expect(screen.getByRole('textbox', { name: 'Search' }).getAttribute('maxlength')).toBe('200')
  })

  it('shows each hit with its kind, location, author and time, with the match in bold, and opens it', async () => {
    const { search } = await import('../api')
    const onGo = await draw('marmalade')
    expect(search).toHaveBeenCalledWith('marmalade')
    const rows = within(await screen.findByRole('list')).getAllByRole('button')
    expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Post by kit: the marmalade is ready',
      'Comment by kit: the marmalade is ready',
      'Message in Knitting by kit: the marmalade is ready',
    ])
    expect(within(rows[0]).getByText('marmalade').className).toContain('font-medium')
    // The line above the excerpt shows the author, then the kind and location, then the time (Raphael, 2026-11-06).
    expect(rows[2].textContent).toMatch(/^kit · Message in Knitting · /)
    fireEvent.click(rows[1])
    expect(onGo).toHaveBeenCalledWith('/p/p1')
    fireEvent.click(rows[2])
    expect(onGo).toHaveBeenCalledWith('/r/knit')
  })

  it('shows a message when nothing matches', async () => {
    const { search } = await import('../api')
    vi.mocked(search).mockResolvedValue({ hits: [] })
    await draw('quince')
    await screen.findByText(/Nothing matches/)
  })
})
