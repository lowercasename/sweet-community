// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ActionRow, ActionRows, Button, ConfirmDialog } from './index'

afterEach(cleanup)

describe('Button', () => {
  it('keeps its accessible name and blocks clicks while busy', () => {
    const onClick = vi.fn()
    render(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect((b as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Button labels', () => {
  it('hidden labels do not change the toggle’s accessible name', () => {
    render(
      <Button variant="ghost" pressed labels={['Weekly digest on', 'Turn weekly digest off']}>
        Weekly digest on
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Weekly digest on' })
    expect(b.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('ConfirmDialog', () => {
  it('keeps the confirmation label and reports its busy state', () => {
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

describe('ActionRows', () => {
  it('groups each description with its action', () => {
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
