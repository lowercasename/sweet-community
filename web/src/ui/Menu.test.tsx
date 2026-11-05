// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Menu } from './Menu'

/**
 * A menu lives inside the pane that holds its button, so it scrolls with
 * it and is clipped by the pane's edge. A scroll, including the one a
 * browser makes to bring the button into view just before it is clicked,
 * must not close it: that is how a menu closed one frame after opening.
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
