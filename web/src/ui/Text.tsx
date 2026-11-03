import type { ReactNode } from 'react'
import styles from './Text.module.css'

interface TextProps {
  as?: 'p' | 'span'
  variant?: 'body' | 'secondary' | 'small'
  weight?: 'normal' | 'bold'
  children?: ReactNode
}

/** Running text. `secondary` and `small` use the one grey. */
export function Text({ as = 'p', variant = 'body', weight = 'normal', children }: TextProps) {
  const cls = `${styles.text} ${styles[variant]} ${weight === 'bold' ? styles.bold : ''}`
  return as === 'span' ? <span className={cls}>{children}</span> : <p className={cls}>{children}</p>
}
