// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { User } from '../api'

/**
 * The page-level guard for the draft bug: closing and reopening a pane, or
 * visiting Settings and coming back, must not remount posts or chat. A
 * remount would fetch their first page again, so one fetch each is the
 * whole assertion. The editors are checked by count: both stay in the DOM.
 */
vi.mock('../api', () => ({
  getPosts: vi.fn(() => Promise.resolve({ posts: [], next_before: null })),
  getMessages: vi.fn(() => Promise.resolve({ messages: [], next_before: null })),
  logout: vi.fn(() => Promise.resolve()),
}))

class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  addEventListener() {}
  close() {}
}

const me: User = { id: 'u1', username: 'raphael', role: 'owner', picture: null }

afterEach(cleanup)

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('ok'))))
  localStorage.setItem('sweet.layout', 'both')
})

describe('Home', () => {
  it('keeps posts and chat mounted across pane and page changes', async () => {
    const { getPosts, getMessages } = await import('../api')
    const { Home } = await import('./Home')
    const { container } = render(<Home me={me} onMeChange={() => {}} onSignOut={() => {}} />)
    await screen.findByText('Nothing here yet. Write the first post.')
    await screen.findByText('Nobody has said anything yet. Say hello.')
    const editors = () => container.querySelectorAll('.ProseMirror').length
    expect(editors()).toBe(2)

    // Close chat from the divider, reopen it from its rail.
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' })
    expect(screen.queryByRole('separator')).toBeNull()
    expect(editors()).toBe(2)
    fireEvent.click(screen.getByTitle('Show chat'))
    expect(screen.getByRole('separator')).toBeTruthy()

    // Close posts, reopen.
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' })
    fireEvent.click(screen.getByTitle('Show posts'))

    // Settings and back.
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await screen.findByText('Profile picture')
    expect(editors()).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('separator')).toBeTruthy()

    expect(editors()).toBe(2)
    expect(getPosts).toHaveBeenCalledTimes(1)
    expect(getMessages).toHaveBeenCalledTimes(1)
  })
})
