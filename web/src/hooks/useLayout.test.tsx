// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useLayout } from './useLayout'

/**
 * The layout (which panes are open, the divider position, the nav state) is
 * one piece of state for the whole page. The tab bar in one component changes
 * it, and the panes in another component must follow. Two hook calls that
 * each kept their own state once left the Posts tab highlighted while the
 * chat pane was still showing.
 */
afterEach(cleanup)

function Tabs() {
  const { setLayout } = useLayout()
  return <button onClick={() => setLayout('posts')}>Posts tab</button>
}
function Panes() {
  const { layout } = useLayout()
  return <p>layout: {layout}</p>
}

describe('useLayout', () => {
  it('is shared, so a change made in one component shows in another', () => {
    localStorage.setItem('sweet.layout', 'chat')
    render(
      <>
        <Tabs />
        <Panes />
      </>,
    )
    expect(screen.getByText('layout: chat')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Posts tab' }))
    expect(screen.getByText('layout: posts')).toBeTruthy()
    expect(localStorage.getItem('sweet.layout')).toBe('posts')
  })

  it('starts with the nav expanded when this browser has stored nothing, and remembers a collapse', async () => {
    // A new user, or the owner just after onboarding, sees the nav's labels (Raphael, 2026-11-09).
    localStorage.removeItem('sweet.nav')
    vi.resetModules()
    const fresh = await import('./useLayout')
    function Nav() {
      const { navExpanded, toggleNav } = fresh.useLayout()
      return <button onClick={toggleNav}>{navExpanded ? 'expanded' : 'collapsed'}</button>
    }
    render(<Nav />)
    expect(screen.getByRole('button').textContent).toBe('expanded')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('collapsed')
    expect(localStorage.getItem('sweet.nav')).toBe('collapsed')
  })
})
