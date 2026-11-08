// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
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
})
