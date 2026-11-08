// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Button } from './Button'
import { NavItem } from './NavItem'

/** A control whose name is not visible shows it in a tooltip, not in the browser's title attribute. */
afterEach(cleanup)

const hover = (el: HTMLElement) => {
  fireEvent.pointerEnter(el, { pointerType: 'mouse' })
  fireEvent.mouseEnter(el)
}

describe('tooltips', () => {
  it('a collapsed nav item shows its name on hover, and carries no title', async () => {
    render(<NavItem icon="home" label="Home" expanded={false} />)
    const item = screen.getByRole('button', { name: 'Home' })
    expect(item.getAttribute('title')).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
    hover(item)
    expect((await screen.findByRole('tooltip')).textContent).toBe('Home')
    fireEvent.mouseLeave(item)
    await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('an expanded nav item has no tooltip, because its name is shown beside it', async () => {
    render(<NavItem icon="home" label="Home" expanded />)
    hover(screen.getByRole('button', { name: 'Home' }))
    await new Promise((r) => setTimeout(r, 500))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('an icon button shows its label in a tooltip, and a button with text does not', async () => {
    render(
      <>
        <Button variant="ghost" icon="trash" label="Delete" />
        <Button variant="ghost" icon="trash" label="Delete all">
          Delete all
        </Button>
      </>,
    )
    const icon = screen.getByRole('button', { name: 'Delete' })
    expect(icon.getAttribute('title')).toBeNull()
    hover(icon)
    expect((await screen.findByRole('tooltip')).textContent).toBe('Delete')
    fireEvent.mouseLeave(icon)
    await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    hover(screen.getByRole('button', { name: 'Delete all' }))
    await new Promise((r) => setTimeout(r, 500))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
