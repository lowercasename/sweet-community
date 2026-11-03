import type { ReactNode } from 'react'
import styles from './Panes.module.css'

interface PanesProps {
  /** Two children side by side (2:3), or one child filling the width. */
  split: boolean
  children?: ReactNode
}

/** The main area under the header. Children are Pane elements. */
export function Panes({ split, children }: PanesProps) {
  return <div className={`${styles.panes} ${split ? styles.split : ''}`}>{children}</div>
}
