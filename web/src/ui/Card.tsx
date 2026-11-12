import type { ReactNode } from 'react'

interface CardProps {
  as?: 'div' | 'article' | 'section'
  /** The accessible name when `as` is section. Used by the topic strip above a feed. */
  label?: string
  /** `fill` makes the card a flex column that takes the pane's full height. Used by chat. */
  fill?: boolean
  /** No rounded corners or border. The card is the whole pane. Used with Pane flush. */
  flush?: boolean
  /** `field` is the background of a comment thread. A light, warm grey panel with no border. */
  tone?: 'card' | 'field'
  /** A strip across the top of the card, edge to edge, with a hairline under it. Used for a post's "Posted in" header. */
  head?: ReactNode
  children?: ReactNode
}

/** A card's side padding. PageNote and Centered inset their text by it, so it lines up with the text in a card. */
export const CARD_INSET = 'px-4 phone:px-3'

/** A white card with a hairline border, on the dotted page background. */
export function Card({ as = 'div', label, fill = false, flush = false, tone = 'card', head, children }: CardProps) {
  const bg = tone === 'field' ? 'bg-ground' : 'bg-card'
  const frame = flush ? bg : tone === 'field' ? `rounded-card ${bg}` : `rounded-card border border-line ${bg}`
  // A card has 16px padding on every side, and a thread background has 12px. On a phone they have 12px and 8px, so
  // text has more width. A flush card is the whole pane and keeps 16px.
  const pad = tone === 'field' ? 'p-3 phone:p-2' : flush ? 'p-4' : `${CARD_INSET} py-4 phone:py-3`
  // An article (a post) has the `block-post` class, so a revealed Menu inside it shows while it is hovered (ui/Menu).
  const cls = `${as === 'article' ? 'block-post ' : ''}${frame} ${fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : pad}`
  // The head strip cancels the card's padding to run edge to edge. Only bordered cards have a head.
  const strip = head ? (
    <div className="-mx-4 -mt-4 mb-4 border-b border-line px-4 pt-3 pb-3.5 phone:-mx-3 phone:-mt-3 phone:mb-3 phone:px-3">
      {head}
    </div>
  ) : null
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
