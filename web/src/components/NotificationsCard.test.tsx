// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithQuery } from '../test-utils'

/**
 * What reaches me when I am away (architecture.md, Notifications): the
 * weekly digest, on until I turn it off, and this device, when the browser
 * can do it.
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
  it('shows the digest on, turns it off and on, and says the action under the pointer', async () => {
    const { setMySettings } = await import('../api')
    const { NotificationsCard } = await import('./NotificationsCard')
    renderWithQuery(<NotificationsCard />)
    const on = await screen.findByRole('button', { name: 'Weekly digest on' })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    fireEvent.mouseEnter(on)
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(setMySettings).toHaveBeenCalledWith({ digest: 'off' })
    const off = await screen.findByRole('button', { name: 'Send me a weekly digest' })
    expect(off.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(off)
    expect(setMySettings).toHaveBeenCalledWith({ digest: 'weekly' })
  })

  it('says when this browser cannot show notifications, instead of offering a button that would fail', async () => {
    const { NotificationsCard } = await import('./NotificationsCard')
    renderWithQuery(<NotificationsCard />)
    await screen.findByText('This browser cannot show notifications.')
    expect(screen.queryByRole('button', { name: 'Notify this device' })).toBeNull()
  })
})
