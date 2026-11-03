import type { ReactNode } from 'react'

interface BarProps {
  as?: 'div' | 'header' | 'footer'
  /** `header` is the app bar with Sweet's pink rule; `footer` sits under a scroll area. */
  edge: 'header' | 'footer'
  children?: ReactNode
}

const EDGES: Record<BarProps['edge'], string> = {
  header: 'border-b-2 border-pink bg-card px-4 py-2',
  footer: 'border-t border-line bg-card px-3 py-2',
}

/** A padded strip pinned above or below a scrolling area. */
export function Bar({ as = 'div', edge, children }: BarProps) {
  const cls = `flex-none ${EDGES[edge]}`
  if (as === 'header') return <header className={cls}>{children}</header>
  if (as === 'footer') return <footer className={cls}>{children}</footer>
  return <div className={cls}>{children}</div>
}
