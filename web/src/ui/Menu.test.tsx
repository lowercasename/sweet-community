// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Menu } from './Menu'

/**
 * A menu is rendered inside the pane that contains its button, so it scrolls
 * with the button and is clipped by the pane's edge. A scroll must not close
 * it. This includes the scroll a browser makes to bring the button into view
 * just before it is clicked, which once closed a menu one frame after it
 * opened.
 */
afterEach(cleanup)

describe('Menu', () => {
  it('stays open when an ancestor scrolls, and is rendered inside the pane rather than on the body', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <div data-testid="pane" style={{ overflow: 'auto', height: 100 }}>
        <Menu label="Post options" items={[{ label: 'Delete', onSelect }]} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }))
    const item = screen.getByRole('menuitem', { name: 'Delete' })
    expect(container.contains(item)).toBe(true)

    fireEvent.scroll(screen.getByTestId('pane'))
    fireEvent.scroll(window)
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy()

    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
