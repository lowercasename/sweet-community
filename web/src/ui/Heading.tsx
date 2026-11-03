import type { ReactNode } from 'react'
import styles from './Heading.module.css'

interface HeadingProps {
  level: 1 | 2 | 3
  children?: ReactNode
}

/** h1–h3. Sizes are deliberately modest; the h1 is the instance name, not a banner. */
export function Heading({ level, children }: HeadingProps) {
  const cls = `${styles.heading} ${styles[`h${level}`]}`
  if (level === 1) return <h1 className={cls}>{children}</h1>
  if (level === 2) return <h2 className={cls}>{children}</h2>
  return <h3 className={cls}>{children}</h3>
}
