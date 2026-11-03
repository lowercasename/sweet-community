import type { ReactNode } from 'react'

interface PanesProps {
  /** Two children side by side (2:3), or one child filling the width. */
  split: boolean
  children?: ReactNode
}

/** The main area under the header. Children are Pane elements. */
export function Panes({ split, children }: PanesProps) {
  const cols = split ? 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : 'grid-cols-[minmax(0,1fr)]'
  return <div className={`grid min-h-0 flex-1 ${cols}`}>{children}</div>
}
