// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
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
  listGroups: vi.fn(() => Promise.resolve({ groups: [] })),
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

describe('ChatPane lines', () => {
  it('shows joined and added lines on their own, between runs of messages (architecture.md, Chat)', async () => {
    const { getMessages } = await import('../api')
    const kit = user('kit')
    vi.mocked(getMessages).mockResolvedValue({
      messages: [
        message('m4', mo, { created_at: 40 }),
        message('a3', kit, { created_at: 30, kind: 'added', subject: mo, body_html: '', body_text: '' }),
        message('j2', mo, { created_at: 20, kind: 'joined', body_html: '', body_text: '' }),
        message('m1', mo, { created_at: 10 }),
      ],
      next_before: null,
    })
    const { ChatPane } = await import('./ChatPane')
    renderWithQuery(<ChatPane groupId={ROOT} watching={false} />)
    await screen.findByText('mo joined the community')
    expect(screen.getByText('kit added mo to the room')).toBeTruthy()
    // The line separates mo's two messages, so each starts its own run under mo's name.
    expect(screen.getAllByRole('button', { name: 'mo' })).toHaveLength(2)
    // Only the two messages can be replied to. The lines have no Reply.
    expect(screen.getAllByRole('button', { name: 'Reply to this message' })).toHaveLength(2)
  })
})

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

describe('ChatPane replies', () => {
  it('attaches the message to the editor on Reply, and Cancel reply removes it', async () => {
    await draw(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply to this message' })[1])
    expect(screen.getByText(/Replying to/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }))
    expect(screen.queryByText(/Replying to/)).toBeNull()
  })
})
