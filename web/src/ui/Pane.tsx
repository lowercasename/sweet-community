import type { ReactNode } from 'react'

interface PaneProps {
  children?: ReactNode
}

/** One column of the Panes grid, padded on the paper; its ScrollArea or Card child scrolls. */
export function Pane({ children }: PaneProps) {
  return <section className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-4">{children}</section>
}
