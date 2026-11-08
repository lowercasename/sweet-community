// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, dm, group, renderWithQuery, user } from '../test-utils'

/**
 * The Conversations page (architecture.md, Layout) lists only the user's DMs, with
 * the most recent message first. Each DM is labelled with the names of its
 * other members. With no DMs, the page shows where to start a conversation.
 */
vi.mock('../api', () => ({
  listGroups: vi.fn(),
  openDM: vi.fn(),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  listMarkers: vi.fn(() => Promise.resolve({ markers: [] })),
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
  return onGo
}

describe('MessagesPage', () => {
  it('lists only DMs, latest message first, labelled with the names of the other members', async () => {
    const onGo = await draw()
    const rows = within(await screen.findByRole('list')).getAllByRole('button')
    expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual(['jo', 'kit', 'mo'])
    expect(screen.queryByText('Knitting')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'kit' }))
    expect(onGo).toHaveBeenCalledWith('/r/d1')
  })

  it('lists hidden conversations below the others, and opening one unhides it', async () => {
    const { listGroups, openDM } = await import('../api')
    vi.mocked(listGroups).mockResolvedValue({
      groups: [group(ROOT, 'member'), dm('d1', [kit, raphael]), dm('d2', [mo, raphael], { hidden_at: 5 })],
    })
    vi.mocked(openDM).mockResolvedValue(dm('d2', [mo, raphael]))
    const onGo = await draw()
    await screen.findByRole('heading', { name: 'Hidden' })
    const lists = screen.getAllByRole('list')
    expect(
      within(lists[0])
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['kit'])
    expect(
      within(lists[1])
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['mo'])
    fireEvent.click(within(lists[1]).getByRole('button', { name: 'mo' }))
    expect(openDM).toHaveBeenCalledWith('mo')
    await vi.waitFor(() => expect(onGo).toHaveBeenCalledWith('/r/d2'))
  })

  it('marks a conversation with unread messages with a dot', async () => {
    const { listMarkers } = await import('../api')
    vi.mocked(listMarkers).mockResolvedValue({
      markers: [{ user_id: 'raphael', stream: 'chat:d1', read_at: 0, unread: 4 }],
    })
    await draw()
    const row = await screen.findByRole('button', { name: 'kit, unread' })
    expect(row.textContent).not.toContain('4')
    expect(screen.getByRole('button', { name: 'jo' })).toBeTruthy()
  })

  it('shows where to start a conversation when there are none', async () => {
    const { listGroups } = await import('../api')
    vi.mocked(listGroups).mockResolvedValue({ groups: [group(ROOT, 'member')] })
    const onGo = await draw()
    await screen.findByText(/No conversations yet/)
    expect(screen.queryByRole('list')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'People' }))
    expect(onGo).toHaveBeenCalledWith('/people')
  })
})
