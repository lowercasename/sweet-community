import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  children?: ReactNode
}

/** A labelled form control. */
export function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-mute">{label}</span>
      {children}
    </label>
  )
}
