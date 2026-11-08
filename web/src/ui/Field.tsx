import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  /** A line of text under the control, for explaining a term the user may not know yet. */
  hint?: string
  children?: ReactNode
}

/** A labelled form control. */
export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-mute">{label}</span>
        {children}
      </label>
      {hint && <span className="text-xs text-mute">{hint}</span>}
    </div>
  )
}
