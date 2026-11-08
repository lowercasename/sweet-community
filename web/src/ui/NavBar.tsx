import type { ReactNode } from 'react'

interface NavBarProps {
  expanded: boolean
  /** Content at the top of the column. This is the wordmark. */
  head: ReactNode
  /** Content at the bottom of the column. This is the account row and the expand control. */
  foot: ReactNode
  children?: ReactNode
}

/**
 * The vertical navigation column. When collapsed it shows icons only. When
 * expanded it also shows labels. On a short window the items scroll between
 * the head and the foot, which stay fixed, so the column never outgrows the
 * window.
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
