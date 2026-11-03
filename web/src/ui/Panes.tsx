import type { ReactNode } from 'react'

export type PanesLayout = 'split' | 'single' | 'left-rail' | 'right-rail'

interface PanesProps {
  layout: PanesLayout
  children?: ReactNode
}

const COLS: Record<PanesLayout, string> = {
  split: 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
  single: 'grid-cols-[minmax(0,1fr)]',
  'left-rail': 'grid-cols-[auto_minmax(0,1fr)]',
  'right-rail': 'grid-cols-[minmax(0,1fr)_auto]',
}

/** The main area under the header. Children are Pane and Rail elements, left to right. */
export function Panes({ layout, children }: PanesProps) {
  return <div className={`grid min-h-0 flex-1 ${COLS[layout]}`}>{children}</div>
}
