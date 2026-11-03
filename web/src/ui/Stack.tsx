import type { ReactNode } from 'react'
import styles from './Stack.module.css'

export type Gap = 0 | 1 | 2 | 3 | 4

interface StackProps {
  gap?: Gap
  as?: 'div' | 'section' | 'main' | 'ul'
  children?: ReactNode
}

/** Vertical flex column with a fixed gap scale: 0, 4, 8, 16, 32px. */
export function Stack({ gap = 2, as = 'div', children }: StackProps) {
  const Tag = as
  return <Tag className={`${styles.stack} ${styles[`gap${gap}`]}`}>{children}</Tag>
}
