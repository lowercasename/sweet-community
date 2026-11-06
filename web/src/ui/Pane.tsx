import type { ReactNode } from 'react'

interface PaneProps {
  /** In a Split the divider supplies the inner gap, so only the outer edge is padded. */
  side?: 'left' | 'right' | 'full'
  /** No paper margin: the content sits against the pane's edges (chat). */
  flush?: boolean
  children?: ReactNode
}

// Side margins only: the top and bottom margin is the ScrollArea's, inside the scroll, so a pane scrolls edge to edge.
const PADS: Record<NonNullable<PaneProps['side']>, string> = {
  left: 'pl-4',
  right: 'pr-4',
  full: 'px-4',
}

/** One column of the layout; its ScrollArea or Card child scrolls. */
export function Pane({ side = 'full', flush = false, children }: PaneProps) {
  const edge = flush ? (side === 'right' ? 'border-l border-line' : '') : PADS[side]
  return <section className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden ${edge}`}>{children}</section>
}
