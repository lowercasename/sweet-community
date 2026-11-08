// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { ROOT, marker, message, renderWithQuery, user } from '../test-utils'

/**
 * A visible chat pane marks its group's chat as read (architecture.md,
 * Notifications). While the pane is watched, the user's read marker on the
 * chat moves to the newest message, so the chat's unread count in the nav is
 * cleared. A pane that is closed or behind another page marks nothing as read.
 */
vi.mock('../api', () => ({
  getMessages: vi.fn(),
  listMarkers: vi.fn(),
  setMarker: vi.fn(),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

const mo = user('mo')

afterEach(cleanup)

beforeEach(async () => {
  const { getMessages, listMarkers, setMarker } = await import('../api')
  vi.mocked(getMessages).mockResolvedValue({
    messages: [message('m2', mo, { created_at: 20 }), message('m1', mo, { created_at: 10 })],
    next_before: null,
  })
  vi.mocked(listMarkers).mockResolvedValue({ markers: [marker(`chat:${ROOT}`, 10, 1)] })
  vi.mocked(setMarker).mockImplementation((stream, readAt) => Promise.resolve(marker(stream, readAt, 0)))
})

async function draw(watching: boolean) {
  const { ChatPane } = await import('./ChatPane')
  renderWithQuery(<ChatPane groupId={ROOT} watching={watching} />)
  await screen.findByText('m2')
}

describe('ChatPane read marker', () => {
  it('moves the read marker to the newest message while watched', async () => {
    const { setMarker } = await import('../api')
    await draw(true)
    await vi.waitFor(() => expect(setMarker).toHaveBeenCalledWith(`chat:${ROOT}`, 20), { timeout: 3000 })
    expect(setMarker).toHaveBeenCalledTimes(1)
  })

  it('does not move the read marker while not watched', async () => {
    const { setMarker } = await import('../api')
    await draw(false)
    await new Promise((r) => setTimeout(r, 1200))
    expect(setMarker).not.toHaveBeenCalled()
  })
})
