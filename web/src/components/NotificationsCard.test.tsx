// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithQuery } from '../test-utils'

/**
 * The settings for notifications sent while the user is away. These are the weekly digest, which is on until the user
 * turns it off, and push notifications to this device, when the browser
 * supports them.
 */
vi.mock('../api', () => ({
  getMySettings: vi.fn(() => Promise.resolve({ digest: 'weekly' })),
  setMySettings: vi.fn((s: { digest: string }) => Promise.resolve(s)),
  getPushKey: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('NotificationsCard', () => {
  it('shows the digest as on, turns it off and on, and shows the action on hover', async () => {
    const { setMySettings } = await import('../api')
    const { NotificationsCard } = await import('./NotificationsCard')
    renderWithQuery(<NotificationsCard />)
    const on = await screen.findByRole('button', { name: 'Weekly digest on' })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    fireEvent.mouseEnter(on)
    expect(screen.getByRole('button', { name: 'Turn weekly digest off' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn weekly digest off' }))
    expect(setMySettings).toHaveBeenCalledWith({ digest: 'off' })
    const off = await screen.findByRole('button', { name: 'Send me a weekly digest' })
    expect(off.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(off)
    expect(setMySettings).toHaveBeenCalledWith({ digest: 'weekly' })
  })

  it('shows a message when this browser cannot show notifications, instead of a button that would fail', async () => {
    const { NotificationsCard } = await import('./NotificationsCard')
    renderWithQuery(<NotificationsCard />)
    await screen.findByText('This browser cannot show notifications.')
    expect(screen.queryByRole('button', { name: 'Notify this device' })).toBeNull()
  })
})
