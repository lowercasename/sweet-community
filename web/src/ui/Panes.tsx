import type { ReactNode } from 'react'

export type PanesLayout = 'single' | 'left-rail' | 'right-rail'

interface PanesProps {
  layout: PanesLayout
  children?: ReactNode
}

const COLS: Record<PanesLayout, string> = {
  single: 'grid-cols-[minmax(0,1fr)]',
  'left-rail': 'grid-cols-[auto_minmax(0,1fr)]',
  'right-rail': 'grid-cols-[minmax(0,1fr)_auto]',
}

/** The main area when it is not a Split: one pane, optionally beside a Rail. */
export function Panes({ layout, children }: PanesProps) {
  return <div className={`grid min-h-0 flex-1 ${COLS[layout]}`}>{children}</div>
}
