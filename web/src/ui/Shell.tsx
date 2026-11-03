import type { ReactNode } from 'react'

interface ShellProps {
  /** The navigation column; omitted on narrow screens. */
  aside?: ReactNode
  children?: ReactNode
}

/** The page frame: an optional nav column on the left, the main area filling the rest. */
export function Shell({ aside, children }: ShellProps) {
  return (
    <div className="flex min-h-0 flex-1">
      {aside}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
