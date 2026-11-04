// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Split, type SplitShow } from './Split'

/**
 * The panes hold editors with half-written drafts. Closing a pane, reopening
 * it, or hiding the whole split behind another page must never unmount them.
 * An uncontrolled input is the simplest stateful child: its value survives
 * only if the very same DOM node does.
 */
function split(show: SplitShow, hidden = false, rails = true) {
  return (
    <Split
      show={show}
      hidden={hidden}
      ratio={0.4}
      onRatio={() => {}}
      onCollapse={() => {}}
      leftRail={rails ? <button>Show posts</button> : undefined}
      rightRail={rails ? <button>Show chat</button> : undefined}
      left={<input aria-label="left draft" />}
      right={<input aria-label="right draft" />}
    />
  )
}

afterEach(cleanup)

describe('Split', () => {
  it('keeps both panes mounted, with their state, through every show state and while hidden', () => {
    const { rerender } = render(split('both'))
    const left = screen.getByLabelText<HTMLInputElement>('left draft')
    const right = screen.getByLabelText<HTMLInputElement>('right draft')
    fireEvent.change(left, { target: { value: 'Half a post' } })
    fireEvent.change(right, { target: { value: 'half a message' } })

    const steps: [SplitShow, boolean][] = [
      ['left', false],
      ['right', false],
      ['both', false],
      ['both', true],
      ['left', true],
      ['both', false],
    ]
    for (const [show, hidden] of steps) {
      rerender(split(show, hidden))
      expect(screen.getByLabelText('left draft')).toBe(left)
      expect(screen.getByLabelText('right draft')).toBe(right)
      expect(left.value).toBe('Half a post')
      expect(right.value).toBe('half a message')
    }
  })

  it('hides the closed pane and shows its rail, and the divider only when both are open', () => {
    const { rerender } = render(split('left'))
    expect(screen.getByLabelText('right draft').closest('.hidden')).not.toBeNull()
    expect(screen.getByLabelText('left draft').closest('.hidden')).toBeNull()
    expect(screen.getByText('Show chat')).toBeTruthy()
    expect(screen.queryByText('Show posts')).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()

    rerender(split('right'))
    expect(screen.getByLabelText('left draft').closest('.hidden')).not.toBeNull()
    expect(screen.getByText('Show posts')).toBeTruthy()

    rerender(split('both'))
    expect(screen.getByRole('separator')).toBeTruthy()
    expect(screen.queryByText('Show posts')).toBeNull()
    expect(screen.queryByText('Show chat')).toBeNull()
  })

  it('gives the open pane the whole width when there are no rails (phones)', () => {
    const { container, rerender } = render(split('right', false, false))
    const grid = () => (container.firstElementChild as HTMLElement).style.gridTemplateColumns
    expect(grid()).toBe('minmax(0, 1fr)')
    rerender(split('left', false, false))
    expect(grid()).toBe('minmax(0, 1fr)')
    rerender(split('left', false, true))
    expect(grid()).toBe('minmax(0, 1fr) auto')
    rerender(split('right', false, true))
    expect(grid()).toBe('auto minmax(0, 1fr)')
  })
})
