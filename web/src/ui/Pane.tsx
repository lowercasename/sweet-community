import type { ReactNode } from 'react'
import styles from './Pane.module.css'

interface PaneProps {
  children?: ReactNode
}

/** One column of the Panes grid: a flex column whose ScrollArea child scrolls. */
export function Pane({ children }: PaneProps) {
  return <section className={styles.pane}>{children}</section>
}
