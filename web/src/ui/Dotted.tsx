import type { ReactNode } from 'react'

interface DottedProps {
  /** Whether the dot shows. */
  shown: boolean
  children?: ReactNode
}

/** Wraps an icon or mark and shows an unread dot on its corner when `shown` is true. */
export function Dotted({ shown, children }: DottedProps) {
  if (!shown) return <>{children}</>
  return (
    <span className="relative flex flex-none">
      {children}
      <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-sweet ring-2 ring-card" />
    </span>
  )
}
