// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ItemBlock } from './ItemBlock'

/**
 * On a touch screen, a tap on a message or comment selects it, which shows its action bar. A tap on a link in it
 * follows the link instead. A second tap, or a press outside the block, clears the selection.
 */
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const touch = (coarse: boolean) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((q) => ({ matches: coarse && q === '(pointer: coarse)' }) as MediaQueryList)

function draw() {
  render(
    <>
      <ItemBlock actions={<button type="button">Reply to this message</button>}>
        <p>
          A message with <a href="/elsewhere">a link</a>
        </p>
      </ItemBlock>
      <p>Outside</p>
    </>,
  )
  return () => screen.getByText(/A message with/).closest('[class*="block-item"]')!
}

describe('ItemBlock', () => {
  it('selects the block on a tap on a touch screen, and clears it on a second tap or a press outside', () => {
    touch(true)
    const block = draw()
    fireEvent.click(screen.getByText(/A message with/))
    expect(block().hasAttribute('data-selected')).toBe(true)
    fireEvent.click(screen.getByText(/A message with/))
    expect(block().hasAttribute('data-selected')).toBe(false)
    fireEvent.click(screen.getByText(/A message with/))
    fireEvent.pointerDown(screen.getByText('Outside'))
    expect(block().hasAttribute('data-selected')).toBe(false)
  })

  it('selects the block when a link is pressed and held, and then does not follow the link', async () => {
    touch(true)
    const block = draw()
    const link = screen.getByText('a link')
    fireEvent.touchStart(link)
    await vi.waitFor(() => expect(block().hasAttribute('data-selected')).toBe(true))
    fireEvent.touchEnd(link)
    // fireEvent returns false when the click's default action, following the link, was prevented.
    expect(fireEvent.click(link)).toBe(false)
    expect(block().hasAttribute('data-selected')).toBe(true)
  })

  it('has an Actions button for a screen reader, which shows and hides the actions', () => {
    touch(true)
    const block = draw()
    const actions = screen.getByRole('button', { name: 'Actions' })
    fireEvent.click(actions)
    expect(actions.getAttribute('aria-expanded')).toBe('true')
    expect(block().hasAttribute('data-selected')).toBe(true)
    fireEvent.click(actions)
    expect(block().hasAttribute('data-selected')).toBe(false)
  })

  it('does not select the block on a tap on a link or an action, or with a pointer', () => {
    touch(true)
    const block = draw()
    fireEvent.click(screen.getByText('a link'))
    fireEvent.click(screen.getByRole('button', { name: 'Reply to this message' }))
    expect(block().hasAttribute('data-selected')).toBe(false)
    touch(false)
    fireEvent.click(screen.getByText(/A message with/))
    expect(block().hasAttribute('data-selected')).toBe(false)
  })
})
