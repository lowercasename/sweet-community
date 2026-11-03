import type { ReactNode } from 'react'
import styles from './Bar.module.css'

interface BarProps {
  as?: 'div' | 'header' | 'footer'
  /** Which edge carries the hairline. */
  edge: 'top' | 'bottom'
  children?: ReactNode
}

/** A padded strip pinned above or below a scrolling area, with one hairline. */
export function Bar({ as = 'div', edge, children }: BarProps) {
  const cls = `${styles.bar} ${styles[edge]}`
  if (as === 'header') return <header className={cls}>{children}</header>
  if (as === 'footer') return <footer className={cls}>{children}</footer>
  return <div className={cls}>{children}</div>
}
