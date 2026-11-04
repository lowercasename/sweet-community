import type { ReactNode } from 'react'

interface PaneProps {
  /** In a Split the divider supplies the inner gap, so only the outer edge is padded. */
  side?: 'left' | 'right' | 'full'
  children?: ReactNode
}

const PADS: Record<NonNullable<PaneProps['side']>, string> = {
  left: 'py-4 pl-4',
  right: 'py-4 pr-4',
  full: 'p-4',
}

/** One column of the layout, padded on the paper; its ScrollArea or Card child scrolls. */
export function Pane({ side = 'full', children }: PaneProps) {
  return <section className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden ${PADS[side]}`}>{children}</section>
}
