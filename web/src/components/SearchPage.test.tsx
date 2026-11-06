// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, group, renderWithQuery, user } from '../test-utils'
import type { Hit } from '../api'

/** Search (architecture.md, Search): the words in the URL, the hits drawn with what, where, who and the matches in bold. */
vi.mock('../api', () => ({
  search: vi.fn(),
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
  it('asks for nothing until words are given, then puts them in the URL', async () => {
    const { search } = await import('../api')
    const onGo = await draw('')
    expect(search).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search for' }), { target: { value: ' marmalade ' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Search for' }).closest('form')!)
    expect(onGo).toHaveBeenCalledWith('/search?q=marmalade')
  })

  it('draws each hit with what and where, who and when, the match in bold, and opens it', async () => {
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
    fireEvent.click(rows[1])
    expect(onGo).toHaveBeenCalledWith('/p/p1')
    fireEvent.click(rows[2])
    expect(onGo).toHaveBeenCalledWith('/r/knit')
  })

  it('says so when nothing matches', async () => {
    const { search } = await import('../api')
    vi.mocked(search).mockResolvedValue({ hits: [] })
    await draw('quince')
    await screen.findByText(/Nothing matches/)
  })
})
