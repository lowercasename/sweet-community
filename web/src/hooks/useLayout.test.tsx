// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useLayout } from './useLayout'

/**
 * The layout (which panes are open, the divider, the nav) is one piece of
 * state for the whole page: the tab bar in one component changes it, the
 * panes in another must follow. Two hook calls that each kept their own
 * state once left the Posts tab lit with the chat pane still showing.
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
  it('is shared: a change made in one component shows in another', () => {
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
