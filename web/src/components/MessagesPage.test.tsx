// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, dm, group, renderWithQuery, user } from '../test-utils'

/**
 * The Messages page (architecture.md, Layout): my DMs and nothing else,
 * the one with the latest word first, each named by its people. With none,
 * it says where a conversation starts.
 */
vi.mock('../api', () => ({
  listGroups: vi.fn(),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

const raphael = user('raphael')
const kit = user('kit')
const mo = user('mo')
const jo = user('jo')

afterEach(cleanup)

beforeEach(async () => {
  const { listGroups } = await import('../api')
  vi.mocked(listGroups).mockResolvedValue({
    groups: [
      group(ROOT, 'member'),
      group('knit', 'member', { name: 'Knitting', last_message_at: 900 }),
      dm('d1', [kit, raphael], { created_at: 1, last_message_at: 50 }),
      dm('d2', [mo, raphael], { created_at: 2, last_message_at: null }),
      dm('d3', [jo, raphael], { created_at: 3, last_message_at: 100 }),
    ],
  })
})

async function draw() {
  const { MessagesPage } = await import('./MessagesPage')
  const onGo = vi.fn()
  renderWithQuery(<MessagesPage me={raphael} onGo={onGo} />)
  await screen.findByRole('heading', { name: 'Messages' })
  return onGo
}

describe('MessagesPage', () => {
  it('lists my DMs only, latest word first, named by the other people', async () => {
    const onGo = await draw()
    const rows = within(await screen.findByRole('list')).getAllByRole('button')
    expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual(['jo', 'kit', 'mo'])
    expect(screen.queryByText('Knitting')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'kit' }))
    expect(onGo).toHaveBeenCalledWith('/r/d1')
  })

  it('says where a conversation starts when there are none', async () => {
    const { listGroups } = await import('../api')
    vi.mocked(listGroups).mockResolvedValue({ groups: [group(ROOT, 'member')] })
    const onGo = await draw()
    await screen.findByText(/No messages yet/)
    expect(screen.queryByRole('list')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'People' }))
    expect(onGo).toHaveBeenCalledWith('/people')
  })
})
