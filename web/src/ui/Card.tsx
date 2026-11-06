import type { ReactNode } from 'react'

interface CardProps {
  as?: 'div' | 'article'
  /** `fill` makes the card a flex column that takes the pane's height (chat). */
  fill?: boolean
  /** No corners or border: the card is the pane (used with Pane flush). */
  flush?: boolean
  /** `field` is a thread's ground: a light, warm grey panel with no edge of its own. */
  tone?: 'card' | 'field'
  children?: ReactNode
}

/** A white card with a hairline, on the dotted paper. */
export function Card({ as = 'div', fill = false, flush = false, tone = 'card', children }: CardProps) {
  const bg = tone === 'field' ? 'bg-ground' : 'bg-card'
  const frame = flush ? bg : tone === 'field' ? `rounded-card ${bg}` : `rounded-card border border-line ${bg}`
  const pad = 'p-4'
  // An article (a post) is a `group`: a revealed Menu inside shows when it is hovered (ui/Menu). A pane's card is not, or hovering a room would show every message's menu.
  const cls = `${as === 'article' ? 'group ' : ''}${frame} ${fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : pad}`
  return as === 'article' ? <article className={cls}>{children}</article> : <div className={cls}>{children}</div>
}
