// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { ROOT, marker, message, paragraph, renderWithQuery, user } from '../test-utils'

/**
 * A visible chat pane marks its group's chat as read. While the pane is watched, the user's read marker on the
 * chat moves to the newest message, so the chat's unread count in the nav is
 * cleared. A pane that is closed or behind another page marks nothing as read.
 */
vi.mock('../api', () => ({
  getMessages: vi.fn(),
  createMessage: vi.fn(),
  getRoomNotificationPreference: vi.fn(() => Promise.resolve({ mode: 'all' })),
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
  it('groups messages up to fifteen minutes apart, but separates days, longer gaps and different authors', async () => {
    const { getMessages } = await import('../api')
    const at = (day: number, hour: number, minute: number) => new Date(2026, 10, day, hour, minute).getTime()
    vi.mocked(getMessages).mockResolvedValue({
      messages: [
        message('yesterday', mo, { created_at: at(11, 23, 55) }),
        message('midnight', mo, { created_at: at(12, 0, 5) }),
        message('seven minutes later', mo, { created_at: at(12, 0, 12) }),
        message('fifteen minutes later', mo, { created_at: at(12, 0, 27) }),
        message('sixteen minutes later', mo, { created_at: at(12, 0, 43) }),
        message('another author', user('kit'), { created_at: at(12, 0, 44) }),
      ].reverse(),
      next_before: null,
    })
    const { ChatPane } = await import('./ChatPane')
    renderWithQuery(<ChatPane groupId={ROOT} watching={false} />)
    await screen.findByText('another author')
    const runs = screen.getAllByRole('article')
    expect(runs).toHaveLength(4)
    expect(runs[1].textContent).toContain('seven minutes later')
    expect(runs[1].textContent).toContain('fifteen minutes later')
    expect(runs[1].querySelectorAll('time')).toHaveLength(1)
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  it('shows joined and added lines on their own, between runs of messages', async () => {
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

describe('ChatPane replies', () => {
  it('keeps the selected reply in the server cache when its author changes or the message is deleted', async () => {
    const { ChatPane } = await import('./ChatPane')
    const { applyEvent } = await import('../data/apply')
    const { createMessage } = await import('../api')
    const { qc } = renderWithQuery(<ChatPane groupId={ROOT} watching={false} />)
    await screen.findByText('m2')
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply to this message' })[1])
    expect(screen.getByText(/Replying to/).textContent).toContain('mo')
    applyEvent(qc, 'message', message('m2', { ...mo, username: 'morgan' }, { created_at: 20 }))
    await vi.waitFor(() => expect(screen.getByText(/Replying to/).textContent).toContain('morgan'))
    applyEvent(qc, 'message_delete', { id: 'm2', group_id: ROOT })
    await screen.findByText('Replying to an unavailable message')
    const editor = (document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
    await act(async () => {
      editor.commands.setContent(paragraph('Answer'))
    })
    vi.mocked(createMessage).mockRejectedValueOnce(new Error('Message is unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Message is unavailable')
    expect(createMessage).toHaveBeenCalledWith(ROOT, paragraph('Answer'), 'm2')
  })

  it('attaches the message to the editor on Reply, and Cancel reply removes it', async () => {
    await draw(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply to this message' })[1])
    expect(screen.getByText(/Replying to/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }))
    expect(screen.queryByText(/Replying to/)).toBeNull()
  })
})
