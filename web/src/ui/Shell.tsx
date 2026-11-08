import type { ReactNode } from 'react'

interface ShellProps {
  /** The navigation column. Omitted on narrow screens. */
  aside?: ReactNode
  children?: ReactNode
}

/** The page frame. An optional nav column on the left, and the main area filling the rest. */
export function Shell({ aside, children }: ShellProps) {
  return (
    <div className="flex min-h-0 flex-1">
      {aside}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
