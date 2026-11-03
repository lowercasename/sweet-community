import type { ReactNode } from 'react'

interface CardProps {
  as?: 'div' | 'article'
  /** `fill` makes the card a flex column that takes the pane's height (chat). */
  fill?: boolean
  children?: ReactNode
}

/** Sweet's white card: 6px corners, a hairline and a soft shadow, on the dotted paper. */
export function Card({ as = 'div', fill = false, children }: CardProps) {
  const cls = `rounded-card border border-line bg-card shadow-card ${fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'p-4'}`
  return as === 'article' ? <article className={cls}>{children}</article> : <div className={cls}>{children}</div>
}
