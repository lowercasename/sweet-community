// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { keys } from '../data/keys'
import { ROOT, group, notification, renderWithQuery, user } from '../test-utils'

/**
 * The Notifications page lists the user's
 * notifications, newest first, in two sections. New holds the unopened
 * notifications. Earlier holds the opened ones, and Clear deletes them.
 * Viewing the page marks nothing as read. Opening a notification marks it as
 * read.
 */
vi.mock('../api', () => ({
  listNotifications: vi.fn(),
  getMySettings: vi.fn(() => Promise.resolve({ digest: 'weekly', welcomed: true })),
  setMySettings: vi.fn(),
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
  vi.mocked(readNotification).mockImplementation(async (id) => {
    const read = notification(id, 'added', mo, { group_id: 'knit', read_at: 30 })
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [read, notification('n10', 'comment', mo, { post_id: 'p1', read_at: 12 })],
      next_before: null,
    })
    return read
  })
  vi.mocked(clearNotifications).mockImplementation(async () => {
    vi.mocked(listNotifications).mockResolvedValue({ notifications: [], next_before: null })
    return { user_id: 'raphael', before: 40 }
  })
})

async function draw() {
  const { NotificationsPage } = await import('./NotificationsPage')
  const onGo = vi.fn()
  renderWithQuery(<NotificationsPage groups={[group(ROOT, 'member'), knitting]} onGo={onGo} />)
  return onGo
}

describe('NotificationsPage', () => {
  it('offers notification settings even when the list is empty', async () => {
    const { listNotifications } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({ notifications: [], next_before: null })
    await draw()
    await screen.findByText('Nice and quiet in here.')
    expect(screen.getByRole('heading', { name: 'Notifications settings' })).toBeTruthy()
  })

  it('lists unopened ones under New and opened ones under Earlier, and viewing marks none read', async () => {
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
    ).toEqual(['mo commented in a discussion you follow'])
    await new Promise((r) => setTimeout(r, 20))
    expect(readNotification).not.toHaveBeenCalled()
  })

  it('opening a notification marks it read, navigates to its target, and moves it to Earlier', async () => {
    const { readNotification } = await import('../api')
    const onGo = await draw()
    fireEvent.click(await screen.findByRole('button', { name: 'mo added you to Knitting, new' }))
    expect(readNotification).toHaveBeenCalledWith('n20', 20, 1)
    expect(onGo).toHaveBeenCalledWith('/r/knit')
    await screen.findByRole('button', { name: 'mo added you to Knitting' })
    expect(screen.queryByRole('heading', { name: 'New' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'mo commented in a discussion you follow' }))
    expect(onGo).toHaveBeenCalledWith('/p/p1')
    expect(readNotification).toHaveBeenCalledTimes(1)
  })

  it('shows "replied to your message" for a reply in chat and opens the chat at that message', async () => {
    const { listNotifications, readNotification } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification('n40', 'reply', mo, { group_id: 'knit', message_id: 'm7' })],
      next_before: null,
    })
    vi.mocked(readNotification).mockImplementation((id) =>
      Promise.resolve(notification(id, 'reply', mo, { group_id: 'knit', message_id: 'm7', read_at: 41 })),
    )
    const onGo = await draw()
    fireEvent.click(await screen.findByRole('button', { name: 'mo replied to your message in Knitting, new' }))
    expect(onGo).toHaveBeenCalledWith('/r/knit?message=m7')
  })

  it('shows "Comment reported" for a report and opens the Community page', async () => {
    const { listNotifications, readNotification } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification('n50', 'report', mo, { group_id: ROOT, report_kind: 'comment' })],
      next_before: null,
    })
    vi.mocked(readNotification).mockImplementation((id) =>
      Promise.resolve(notification(id, 'report', mo, { group_id: ROOT, report_kind: 'comment', read_at: 51 })),
    )
    const onGo = await draw()
    // Only the owner and moderators get a report notification, so it carries the shield.
    expect(
      (await screen.findByRole('button', { name: 'Comment reported, new' })).querySelector('[data-shield]'),
    ).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Comment reported, new' }))
    expect(onGo).toHaveBeenCalledWith('/community')
  })

  it('shows "messaged you" for a message notification and opens the conversation', async () => {
    const { listNotifications, readNotification } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification('n30', 'message', mo, { group_id: 'talk', group_kind: 'dm' })],
      next_before: null,
    })
    vi.mocked(readNotification).mockImplementation(async (id) => {
      const read = notification(id, 'message', mo, { group_id: 'talk', group_kind: 'dm', read_at: 31 })
      vi.mocked(listNotifications).mockResolvedValue({ notifications: [read], next_before: null })
      return read
    })
    const onGo = await draw()
    fireEvent.click(await screen.findByRole('button', { name: 'mo messaged you, new' }))
    expect(onGo).toHaveBeenCalledWith('/r/talk')
    await screen.findByRole('button', { name: 'mo messaged you' })
  })

  it('permanently deletes read and unread notifications', async () => {
    const { clearNotifications } = await import('../api')
    await draw()
    await screen.findByRole('heading', { name: 'Earlier' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(clearNotifications).toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Earlier' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'mo added you to Knitting, new' })).toBeNull()
  })

  it("describes a mention by its location, which is a post or a group's chat", async () => {
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
    const rows = await screen.findAllByRole('button', { name: /^mo mentioned you/ })
    expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
      'mo mentioned you in a post discussion, new',
      'mo mentioned you in Knitting, new',
      'mo mentioned you in the chat, new',
    ])
    // A mention in a post opens the post. A mention in a chat opens the group.
    fireEvent.click(rows[0])
    expect(onGo).toHaveBeenCalledWith('/p/p1')
    fireEvent.click(rows[1])
    expect(onGo).toHaveBeenCalledWith('/r/knit')
  })

  it('shows an empty state that says what will appear when there are no notifications', async () => {
    const { listNotifications } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({ notifications: [], next_before: null })
    await draw()
    await screen.findByText(/Nice and quiet in here/)
    expect(screen.queryByRole('heading', { name: 'New' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Earlier' })).toBeNull()
  })

  it('labels a group the user is no longer in as "a room"', async () => {
    const { listNotifications } = await import('../api')
    vi.mocked(listNotifications).mockResolvedValue({
      notifications: [notification('n20', 'added', mo, { group_id: 'gone' })],
      next_before: null,
    })
    await draw()
    expect(await screen.findByRole('button', { name: 'mo added you to a room, new' })).toBeTruthy()
  })
})

it('does not restore a cleared notification when an older read request finishes', async () => {
  const { readNotification, listNotifications } = await import('../api')
  let finishRead!: (value: Awaited<ReturnType<typeof readNotification>>) => void
  vi.mocked(readNotification).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve
      }),
  )
  const { NotificationsPage } = await import('./NotificationsPage')
  const { qc } = renderWithQuery(<NotificationsPage groups={[group(ROOT, 'member'), knitting]} onGo={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'mo added you to Knitting, new' }))
  vi.mocked(listNotifications).mockResolvedValue({ notifications: [], next_before: null })
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  await screen.findByText('Nice and quiet in here.')
  await act(async () => {
    finishRead(notification('n20', 'added', mo, { group_id: 'knit', read_at: 30 }))
  })
  expect(qc.getQueryData(keys.notifications)).toMatchObject({ pages: [{ notifications: [] }] })
})
