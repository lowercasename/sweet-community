import type { ReactNode } from 'react'

interface CardProps {
  as?: 'div' | 'article'
  /** `fill` makes the card a flex column that takes the pane's height (chat). */
  fill?: boolean
  /** No corners or border: the card is the pane (used with Pane flush). */
  flush?: boolean
  /** `field` is old Sweet's comment box: a small, light grey card. */
  tone?: 'card' | 'field'
  children?: ReactNode
}

/** A white card with a hairline, on the dotted paper. */
export function Card({ as = 'div', fill = false, flush = false, tone = 'card', children }: CardProps) {
  const bg = tone === 'field' ? 'bg-field' : 'bg-card'
  const frame = flush ? bg : `rounded-card border border-line ${bg}`
  const pad = tone === 'field' ? 'px-3 py-2' : 'p-4'
  const cls = `${frame} ${fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : pad}`
  return as === 'article' ? <article className={cls}>{children}</article> : <div className={cls}>{children}</div>
}
