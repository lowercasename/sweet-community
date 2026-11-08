// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, group, notification, renderWithQuery, user } from '../test-utils'

/**
 * The Notifications page (architecture.md, Notifications): mine, newest
 * first, in two sections: New, the ones not yet opened, and Earlier, the
 * opened ones, which Clear deletes. Looking at the page reads nothing;
 * opening a notification does.
 */
vi.mock('../api', () => ({
  listNotifications: vi.fn(),
  listMarkers: vi.fn(() => Promise.resolve({ markers: [] })),
  readNotification: vi.fn(),
  clearNotifications: vi.fn(),
  listTopics: vi.fn(() => Promise.resolve({ topics: [] })),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

const mo = user('mo')
const knitting = group('knit', 'member', { name: 'Knitting' })

afterEach(cleanup)

beforeEach(async () => {
  const { listNotifications, readNotification, clearNotifications } = await import('../api')
  vi.mocked(listNotifications).mockResolvedValue({
    notifications: [
      notification('n20', 'added', mo, { group_id: 'knit' }),
      notification('n10', 'comment', mo, { post_id: 'p1', read_at: 12 }),
    ],
    next_before: null,
  })
  vi.mocked(readNotification).mockImplementation((id) =>
    Promise.resolve(notification(id, 'added', mo, { group_id: 'knit', read_at: 30 })),
  )
  vi.mocked(clearNotifications).mockResolvedValue({ user_id: 'raphael', before: 40 })
})

async function draw() {
  const { NotificationsPage } = await import('./NotificationsPage')
  const onGo = vi.fn()
  renderWithQuery(<NotificationsPage groups={[group(ROOT, 'member'), knitting]} onGo={onGo} />)
  return onGo
}

describe('NotificationsPage', () => {
  it('lists the unopened under New and the opened under Earlier; looking reads nothing', async () => {
    const { readNotification } = await import('../api')
    await draw()
    await screen.findByRole('heading', { name: 'New' })
    const lists = screen.getAllByRole('list')
    expect(
      within(lists[0])
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['mo added you to Knitting, new'])
    expect(screen.getByRole('heading', { name: 'Earlier' })).toBeTruthy()
    expect(
      within(lists[1])
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['mo commented on your post'])
    await new Promise((r) => setTimeout(r, 20))
    expect(readNotification).not.toHaveBeenCalled()
  })

  it('opening one reads it and goes to its thing; it moves to Earlier', async () => {
    const { readNotification } = await import('../api')
    const onGo = await draw()
    fireEvent.click(await screen.findByRole('button', { name: 'mo added you to Knitting, new' }))
    expect(readNotification).toHaveBeenCalledWith('n20')
    expect(onGo).toHaveBeenCalledWith('/r/knit')
    await screen.findByRole('button', { name: 'mo added you to Knitting' })
    expect(screen.queryByRole('heading', { name: 'New' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'mo commented on your post' }))
    expect(onGo).toHaveBeenCalledWith('/p/p1')
    expect(readNotification).toHaveBeenCalledTimes(1)
  })

  it('a message notification reads "messaged you" and opens the conversation', async () => {
    const { listNotifications, readNotification } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification('n30', 'message', mo, { group_id: 'talk' })],
      next_before: null,
    })
    vi.mocked(readNotification).mockImplementation((id) =>
      Promise.resolve(notification(id, 'message', mo, { group_id: 'talk', read_at: 31 })),
    )
    const onGo = await draw()
    fireEvent.click(await screen.findByRole('button', { name: 'mo messaged you, new' }))
    expect(onGo).toHaveBeenCalledWith('/r/talk')
    await screen.findByRole('button', { name: 'mo messaged you' })
  })

  it('clears the opened ones for good; the unopened stay', async () => {
    const { clearNotifications } = await import('../api')
    await draw()
    await screen.findByRole('heading', { name: 'Earlier' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(clearNotifications).toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Earlier' })).toBeNull())
    expect(screen.getByRole('button', { name: 'mo added you to Knitting, new' })).toBeTruthy()
  })

  it("words a mention by where it was: a post, or the room's chat", async () => {
    const { listNotifications } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [
        notification('n30', 'mention', mo, { post_id: 'p1' }),
        notification('n20', 'mention', mo, { group_id: 'knit', post_id: null }),
        notification('n10', 'mention', mo, { group_id: ROOT, post_id: null }),
      ],
      next_before: null,
    })
    const onGo = await draw()
    const rows = within(await screen.findByRole('list')).getAllByRole('button')
    expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
      'mo mentioned you in a post, new',
      'mo mentioned you in Knitting, new',
      'mo mentioned you in the chat, new',
    ])
    // A mention in a post opens the post; one in a chat opens the room.
    fireEvent.click(rows[0])
    expect(onGo).toHaveBeenCalledWith('/p/p1')
    fireEvent.click(rows[1])
    expect(onGo).toHaveBeenCalledWith('/r/knit')
  })

  it('says what will show here when nothing has yet', async () => {
    const { listNotifications } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({ notifications: [], next_before: null })
    await draw()
    await screen.findByText(/Nice and quiet/)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('names a room I am no longer in as a room', async () => {
    const { listNotifications } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification('n20', 'added', mo, { group_id: 'gone' })],
      next_before: null,
    })
    await draw()
    expect((await screen.findByRole('list')).querySelector('button')!.getAttribute('aria-label')).toBe(
      'mo added you to a room, new',
    )
  })
})
