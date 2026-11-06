import type { ReactNode } from 'react'
import { UnreadDot } from './NavItem'

interface DottedProps {
  /** Whether the dot shows. */
  shown: boolean
  children?: ReactNode
}

/** An icon or mark with an unread dot on its corner when something behind it is unread. */
export function Dotted({ shown, children }: DottedProps) {
  if (!shown) return <>{children}</>
  return (
    <span className="relative flex flex-none">
      {children}
      <UnreadDot />
    </span>
  )
}
