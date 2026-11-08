import type { ReactNode } from 'react'
import { UnreadDot } from './NavItem'

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
      <UnreadDot />
    </span>
  )
}
