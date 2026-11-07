import type { ReactNode } from 'react'

interface CardProps {
  as?: 'div' | 'article' | 'section'
  /** A section's accessible name (the topic strip above a feed). */
  label?: string
  /** `fill` makes the card a flex column that takes the pane's height (chat). */
  fill?: boolean
  /** No corners or border: the card is the pane (used with Pane flush). */
  flush?: boolean
  /** `field` is a thread's ground: a light, warm grey panel with no edge of its own. */
  tone?: 'card' | 'field'
  /** A strip across the card's top, edge to edge, with a hairline under it: a post's "Posted in" header. */
  head?: ReactNode
  children?: ReactNode
}

/** A white card with a hairline, on the dotted paper. */
export function Card({ as = 'div', label, fill = false, flush = false, tone = 'card', head, children }: CardProps) {
  const bg = tone === 'field' ? 'bg-ground' : 'bg-card'
  const frame = flush ? bg : tone === 'field' ? `rounded-card ${bg}` : `rounded-card border border-line ${bg}`
  // A thread's ground is drawn with 12px all round; a card with 16.
  const pad = tone === 'field' ? 'p-3' : 'p-4'
  // An article (a post) is a `block-post`: its revealed Menu shows while it is hovered (ui/Menu).
  const cls = `${as === 'article' ? 'block-post ' : ''}${frame} ${fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : pad}`
  const strip = head ? <div className="-mx-4 -mt-4 mb-4 border-b border-line px-4 py-3">{head}</div> : null
  return as === 'article' ? (
    <article className={cls}>
      {strip}
      {children}
    </article>
  ) : as === 'section' ? (
    <section className={cls} aria-label={label}>
      {strip}
      {children}
    </section>
  ) : (
    <div className={cls}>
      {strip}
      {children}
    </div>
  )
}
