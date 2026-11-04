import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { Heading } from './Heading'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** The action, in the same words as the menu item that led here: "Delete". */
  confirmLabel: string
  /** True while the action runs; the confirm button waits. */
  busy?: boolean
  onConfirm: () => void
  /** Cancel, Escape, or a click on the backdrop. */
  onClose: () => void
  children?: ReactNode
}

/** A modal question with one real action and Cancel. The browser's own dialog element: focus and Escape come free. */
export function ConfirmDialog({ open, title, confirmLabel, busy, onConfirm, onClose, children }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])
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
