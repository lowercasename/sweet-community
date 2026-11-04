import type { ReactNode } from 'react'
import type { Gap } from './Stack'

const GAPS: Record<Gap, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-4',
  4: 'gap-8',
}

interface RowProps {
  gap?: Gap
  justify?: 'start' | 'between'
  align?: 'baseline' | 'center' | 'start'
  /** A bar across the top of a pane: padded, with a hairline under it. */
  pad?: boolean
  children?: ReactNode
}

/** Horizontal flex row. Wraps at narrow widths. */
export function Row({ gap = 2, justify = 'start', align = 'baseline', pad = false, children }: RowProps) {
  const cls = [
    'flex min-w-0 flex-row flex-wrap',
    GAPS[gap],
    justify === 'between' ? 'justify-between' : 'justify-start',
    align === 'center' ? 'items-center' : align === 'start' ? 'items-start' : 'items-baseline',
    pad ? 'border-b border-line bg-card px-4 py-2' : '',
  ]
  return <div className={cls.join(' ')}>{children}</div>
}
