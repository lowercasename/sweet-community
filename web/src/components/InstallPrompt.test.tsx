// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The install prompt on Home. It shows only on a touch screen that can add Sweet to the
 * home screen and has not done so. Not now hides it in this browser for 30 days.
 */
const state = vi.hoisted(() => ({ way: 'dialog' as 'installed' | 'dialog' | 'ios' | 'none' }))
vi.mock('../install', () => ({
  installWay: () => state.way,
  subscribeInstall: () => () => {},
  install: vi.fn(() => {
    state.way = 'installed'
    return Promise.resolve()
  }),
}))

function touch(coarse: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' ? coarse : false }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  state.way = 'dialog'
})

describe('InstallPrompt', () => {
  it('offers the browser’s install dialog on a touch screen, and hides once installed', async () => {
    const { install } = await import('../install')
    const { InstallPrompt } = await import('./InstallPrompt')
    touch(true)
    const { rerender } = render(<InstallPrompt name="Knitting Circle" />)
    expect(
      screen.getByText('Add Knitting Circle to your home screen to open it like an app and get notifications.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add to home screen' }))
    await vi.waitFor(() => expect(install).toHaveBeenCalled())
    rerender(<InstallPrompt name="Knitting Circle" />)
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Add to home screen' })).toBeNull())
  })

  it('on an iPhone it says where to find Add to Home Screen, with no button for it', async () => {
    const { InstallPrompt } = await import('./InstallPrompt')
    touch(true)
    state.way = 'ios'
    render(<InstallPrompt name="Knitting Circle" />)
    expect(screen.getByText('Tap the Share button, then Add to Home Screen.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add to home screen' })).toBeNull()
  })

  it('Not now hides it, and it stays hidden for 30 days', async () => {
    const { InstallPrompt } = await import('./InstallPrompt')
    touch(true)
    render(<InstallPrompt name="Knitting Circle" />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/to your home screen/)).toBeNull()
    cleanup()
    render(<InstallPrompt name="Knitting Circle" />)
    expect(screen.queryByText(/to your home screen/)).toBeNull()
    localStorage.setItem('sweet.install', String(Date.now() - 31 * 24 * 60 * 60 * 1000))
    cleanup()
    render(<InstallPrompt name="Knitting Circle" />)
    expect(screen.getByText(/to your home screen/)).toBeTruthy()
  })

  it('shows nothing with a mouse, nothing in the installed app, and nothing where the browser cannot install', async () => {
    const { InstallPrompt } = await import('./InstallPrompt')
    touch(false)
    render(<InstallPrompt name="Knitting Circle" />)
    expect(screen.queryByText(/to your home screen/)).toBeNull()
    cleanup()
    touch(true)
    for (const way of ['installed', 'none'] as const) {
      state.way = way
      render(<InstallPrompt name="Knitting Circle" />)
      expect(screen.queryByText(/to your home screen/)).toBeNull()
      cleanup()
    }
  })
})
