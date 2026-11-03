import type { ReactNode } from 'react'
import styles from './Measure.module.css'

interface MeasureProps {
  children?: ReactNode
}

/** Centres content at the reading measure (640px). */
export function Measure({ children }: MeasureProps) {
  return <div className={styles.measure}>{children}</div>
}
