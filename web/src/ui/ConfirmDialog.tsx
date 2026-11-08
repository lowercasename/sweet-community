import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { Heading } from './Heading'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** The confirm button's text. Uses the same wording as the menu item that opened the dialog, for example "Delete". */
  confirmLabel: string
  /** True while the action runs. The confirm button is disabled meanwhile. */
  busy?: boolean
  onConfirm: () => void
  /** Called on Cancel, on Escape, or on a click on the backdrop. */
  onClose: () => void
  children?: ReactNode
}

/** A modal dialog with one action button and Cancel. It uses the native dialog element, which handles focus and Escape itself. */
export function ConfirmDialog({ open, title, confirmLabel, busy, onConfirm, onClose, children }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  // The dialog is mounted only while open. It calls showModal on mount and is removed from the DOM on close.
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [open])
  if (!open) return null
  return (
    <dialog
      ref={ref}
      className="m-auto w-[min(92vw,24rem)] rounded-card border border-line bg-card p-4 text-ink backdrop:bg-ink/30"
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
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
