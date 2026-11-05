import type { ReactNode } from 'react'

export type Gap = 0 | 1 | 2 | 3 | 4

const GAPS: Record<Gap, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-4',
  4: 'gap-8',
}

interface StackProps {
  gap?: Gap
  as?: 'div' | 'section' | 'main' | 'ul'
  /** Take the parent's remaining room: height in a column (a column of panes), width in a row (a message beside its menu). */
  fill?: boolean
  /** Out of sight but still mounted. */
  hidden?: boolean
  children?: ReactNode
}

/** Vertical flex column with a fixed gap scale: 0, 4, 8, 16, 32px. */
export function Stack({ gap = 2, as = 'div', fill = false, hidden = false, children }: StackProps) {
  const Tag = as
  const cls = hidden ? 'hidden' : `flex min-w-0 flex-col ${GAPS[gap]} ${fill ? 'min-h-0 flex-1' : ''}`
  return <Tag className={cls}>{children}</Tag>
}
