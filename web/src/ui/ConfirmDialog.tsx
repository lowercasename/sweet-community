import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { Heading } from './Heading'
import type { IconName } from './Icon'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** The confirm button's text. Uses the same words as the control that opened the dialog, for example "Delete room". */
  confirmLabel: string
  /** The text of the button that closes the dialog without acting. Cancel unless the dialog offers something else. */
  cancelLabel?: string
  /**
   * The icon of the control that opened the dialog, for an action that removes something (trash, remove, logout,
   * devices). The confirm button is a primary, so the icon is what marks it as destructive.
   */
  icon?: IconName
  /** True while the action runs. The confirm button shows a spinner and both buttons are disabled. */
  busy?: boolean
  onConfirm: () => void
  /** Called on Cancel, on Escape, or on a click on the backdrop. */
  onClose: () => void
  /**
   * True once the action has finished and the dialog says so, as after a report is sent. The dialog then shows one
   * Done button, which closes it, in place of Cancel and the confirm button. The caller changes the title and text.
   */
  done?: boolean
  /**
   * What takes focus when the dialog opens. `first` is the browser's choice, the first control. `dialog` focuses the
   * dialog itself, for a dialog that opens without the user doing anything, such as the welcome dialog on page load.
   * A focused button would show its focus ring before the user had touched anything. Tab reaches the buttons.
   */
  focus?: 'first' | 'dialog'
  children?: ReactNode
}

/** A modal dialog with one action button and Cancel. It uses the native dialog element, which handles focus and Escape itself. */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel = 'Cancel',
  icon,
  busy,
  onConfirm,
  onClose,
  done = false,
  focus = 'first',
  children,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  // The dialog is mounted only while open. It calls showModal on mount and is removed from the DOM on close.
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) {
      d.showModal()
      if (focus === 'dialog') d.focus()
    }
  }, [open, focus])
  if (!open) return null
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      className="m-auto w-[min(92vw,24rem)] rounded-card border border-line bg-card p-4 text-ink backdrop:bg-scrim focus:outline-none"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex flex-col gap-3">
        <Heading level={2}>{title}</Heading>
        {children}
        <div className="flex items-center justify-end gap-2">
          {done ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" disabled={busy} onClick={onClose}>
                {cancelLabel}
              </Button>
              <Button icon={icon} busy={busy} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </dialog>
  )
}
