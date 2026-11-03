import type { ReactNode } from 'react'

interface NavBarProps {
  expanded: boolean
  /** Top of the column: the wordmark. */
  head: ReactNode
  /** Bottom of the column: the account row and the expand control. */
  foot: ReactNode
  children?: ReactNode
}

/** The vertical navigation column. Narrow shows icons; expanded adds labels. */
export function NavBar({ expanded, head, foot, children }: NavBarProps) {
  return (
    <nav
      aria-label="Main"
      className={`flex flex-none flex-col gap-1 border-r border-line bg-card p-2 transition-[width] duration-150 ${expanded ? 'w-52' : 'w-14'}`}
    >
      <div className="mb-2 px-1 py-1">{head}</div>
      {children}
      <div className="mt-auto flex flex-col gap-1">{foot}</div>
    </nav>
  )
}
