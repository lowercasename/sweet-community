// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ActionRow, ActionRows, Button, ConfirmDialog, Menu } from './index'

/**
 * The button system (architecture.md, Interface): four variants, a busy state that
 * keeps the label, a confirm dialog whose confirm button carries the danger
 * icon, danger items in menus, and action rows.
 */
afterEach(cleanup)

describe('Button', () => {
  it('while busy keeps its label, shows a spinner, is disabled, and keeps its colour instead of the faded disabled look', () => {
    const onClick = vi.fn()
    render(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(b.querySelector('.animate-spin')).not.toBeNull()
    expect(b.className).not.toContain('disabled:bg-sweet/45')
    fireEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('a disabled primary is faded red, not grey', () => {
    render(<Button disabled>Save</Button>)
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b.className).toContain('disabled:bg-sweet-off')
    expect(b.className).not.toContain('disabled:bg-line')
  })

  it('danger is bordered like secondary, in red', () => {
    render(
      <Button variant="danger" icon="trash">
        Delete room
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Delete room' })
    expect(b.className).toContain('border-blush-line')
    expect(b.className).toContain('text-sweet')
    expect(b.className).toContain('bg-card')
  })

  it('text and icon-only buttons are the same height: 15px text on a 22px line with 5px padding, or 7px around an icon', () => {
    render(
      <>
        <Button>Save</Button>
        <Button variant="ghost" icon="more" label="Options" />
      </>,
    )
    const text = screen.getByRole('button', { name: 'Save' }).className
    expect(text).toContain('text-[15px]')
    expect(text).toContain('leading-[22px]')
    expect(text).toContain('py-[5px]')
    expect(screen.getByRole('button', { name: 'Options' }).className).toContain('p-[7px]')
  })
})

describe('Button labels', () => {
  it('a toggle reserves the width of its longest label, so it does not change size on hover', () => {
    render(
      <Button variant="ghost" pressed labels={['Weekly digest on', 'Turn weekly digest off']}>
        Weekly digest on
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Weekly digest on' })
    const hidden = b.querySelectorAll('[aria-hidden="true"].invisible')
    expect([...hidden].map((h) => h.textContent)).toEqual(['Weekly digest on', 'Turn weekly digest off'])
  })
})

describe('ConfirmDialog', () => {
  it('puts the danger icon on the confirm button, and shows busy on it without changing its words', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Delete this room?"
        confirmLabel="Delete room"
        icon="trash"
        busy
        onConfirm={onConfirm}
        onClose={() => {}}
      >
        Its posts and chat will be deleted for everyone.
      </ConfirmDialog>,
    )
    const confirm = screen.getByRole('button', { name: 'Delete room' })
    expect(confirm.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })
})

describe('Menu', () => {
  it('shows a danger item in red', () => {
    render(
      <Menu
        label="Post options"
        items={[
          { label: 'Edit', onSelect: () => {} },
          { label: 'Delete', danger: true, onSelect: () => {} },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }))
    expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toContain('text-sweet')
    expect(screen.getByRole('menuitem', { name: 'Edit' }).className).not.toContain('text-sweet')
  })
})

describe('ActionRows', () => {
  it('lays out one action per row: a title and a description, then the action', () => {
    render(
      <ActionRows>
        <ActionRow title="This device" action={<Button variant="secondary">Sign out</Button>}>
          Sign out of Sweet in this browser.
        </ActionRow>
        <ActionRow
          title="Every device"
          action={
            <Button variant="danger" icon="devices">
              Sign out everywhere
            </Button>
          }
        >
          Sign out everywhere, including this browser.
        </ActionRow>
      </ActionRows>,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('This device')
    expect(rows[0].textContent).toContain('Sign out of Sweet in this browser.')
    expect(rows[1].querySelector('button')?.textContent).toBe('Sign out everywhere')
  })
})
