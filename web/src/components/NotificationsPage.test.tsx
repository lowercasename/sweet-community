// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, group, marker, notification, renderWithQuery, user } from '../test-utils'

/**
 * The Notifications page (architecture.md, Notifications): mine, newest
 * first, each a sentence about who did what, opening the thing. The ones
 * newer than my marker when I arrived are marked new; looking at the page
 * moves the marker to the newest, so the bell's dot goes.
 */
vi.mock('../api', () => ({
  listNotifications: vi.fn(),
  listMarkers: vi.fn(),
  setMarker: vi.fn(),
  clearNotifications: vi.fn(),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

const mo = user('mo')
const knitting = group('knit', 'member', { name: 'Knitting' })

afterEach(cleanup)

beforeEach(async () => {
  const { listNotifications, listMarkers, setMarker } = await import('../api')
  vi.mocked(listNotifications).mockResolvedValue({
    notifications: [
      notification('n20', 'added', mo, { group_id: 'knit' }),
      notification('n10', 'comment', mo, { post_id: 'p1' }),
    ],
    next_before: null,
  })
  vi.mocked(listMarkers).mockResolvedValue({ markers: [marker('notifications', 10)] })
  vi.mocked(setMarker).mockImplementation((stream, readAt) => Promise.resolve(marker(stream, readAt)))
})

async function draw() {
  const { NotificationsPage } = await import('./NotificationsPage')
  const onGo = vi.fn()
  renderWithQuery(<NotificationsPage groups={[group(ROOT, 'member'), knitting]} onGo={onGo} />)
  return onGo
}

describe('NotificationsPage', () => {
  it('lists what was done to me in two sections, New and Earlier, and marks them read by being looked at', async () => {
    const { setMarker } = await import('../api')
    const onGo = await draw()
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
    await vi.waitFor(() => expect(setMarker).toHaveBeenCalledWith('notifications', 20))
    // Still marked new while I look, though the marker has moved on.
    expect(screen.getByRole('button', { name: 'mo added you to Knitting, new' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'mo commented on your post' }))
    expect(onGo).toHaveBeenCalledWith('/p/p1')
    fireEvent.click(screen.getByRole('button', { name: 'mo added you to Knitting, new' }))
    expect(onGo).toHaveBeenCalledWith('/r/knit')
  })

  it('leaves the marker alone when nothing is newer than it', async () => {
    const { listMarkers, setMarker } = await import('../api')
    vi.mocked(listMarkers).mockResolvedValue({ markers: [marker('notifications', 20)] })
    await draw()
    await screen.findByRole('list')
    await new Promise((r) => setTimeout(r, 20))
    expect(setMarker).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /new$/ })).toBeNull()
  })

  it('clears the earlier ones for good, up to where I had read when I arrived; the new ones stay', async () => {
    const { clearNotifications } = await import('../api')
    vi.mocked(clearNotifications).mockImplementation((before) => Promise.resolve({ user_id: 'raphael', before }))
    await draw()
    await screen.findByRole('heading', { name: 'Earlier' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(clearNotifications).toHaveBeenCalledWith(10)
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Earlier' })).toBeNull())
    expect(screen.getByRole('button', { name: 'mo added you to Knitting, new' })).toBeTruthy()
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
