import type { ReactNode } from 'react'
import type { Gap } from './Stack'
import styles from './Row.module.css'

interface RowProps {
  gap?: Gap
  justify?: 'start' | 'between'
  align?: 'baseline' | 'center'
  children?: ReactNode
}

/** Horizontal flex row. Wraps at narrow widths. */
export function Row({ gap = 2, justify = 'start', align = 'baseline', children }: RowProps) {
  const cls = [styles.row, styles[`gap${gap}`], styles[`justify-${justify}`], styles[`align-${align}`]]
  return <div className={cls.join(' ')}>{children}</div>
}
