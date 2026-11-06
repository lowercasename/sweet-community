import type { ReactNode } from 'react'

interface NavBarProps {
  expanded: boolean
  /** Top of the column: the wordmark. */
  head: ReactNode
  /** Bottom of the column: the account row and the expand control. */
  foot: ReactNode
  children?: ReactNode
}

/**
 * The vertical navigation column. Narrow shows icons; expanded adds labels.
 * On a short window the places and tools scroll between the wordmark and
 * the foot, which stay where they are: the column never outgrows the window.
 */
export function NavBar({ expanded, head, foot, children }: NavBarProps) {
  return (
    <nav
      aria-label="Main"
      className={`flex min-h-0 flex-none flex-col border-r border-line bg-card p-2 transition-[width] duration-150 ${expanded ? 'w-52' : 'w-14'}`}
    >
      <div className="mb-3 flex-none px-1 py-1">{head}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">{children}</div>
      <div className="mt-1 flex flex-none flex-col gap-1 pt-1">{foot}</div>
    </nav>
  )
}
