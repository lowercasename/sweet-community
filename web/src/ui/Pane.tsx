import type { ReactNode } from 'react'

interface PaneProps {
  /** Which side of a Split this pane is on. The divider supplies the inner gap, so only the outer edge is padded. */
  side?: 'left' | 'right' | 'full'
  /** No side padding. The content sits against the pane's edges. Used by chat. */
  flush?: boolean
  children?: ReactNode
}

// Side padding only. The ScrollArea supplies the top and bottom margin inside the scroll container, so a pane scrolls edge to edge.
const PADS: Record<NonNullable<PaneProps['side']>, string> = {
  left: 'pl-4',
  right: 'pr-4',
  full: 'px-4',
}

/** One column of the layout. Its ScrollArea or Card child is the element that scrolls. */
export function Pane({ side = 'full', flush = false, children }: PaneProps) {
  const edge = flush ? (side === 'right' ? 'border-l border-line' : '') : PADS[side]
  return <section className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden ${edge}`}>{children}</section>
}
