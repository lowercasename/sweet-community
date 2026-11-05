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
  /**
   * `always`: wrap whenever the children's natural widths overflow (flex
   * wraps before it shrinks). `narrow`: stay on one line and let the
   * children shrink while the nearest container (a ListItem) is at least
   * 36rem wide; wrap below that. For a list row with actions on the right.
   */
  wrap?: 'always' | 'narrow'
  /** Never shrink: an actions cluster keeps its buttons whole. */
  shrink?: boolean
  children?: ReactNode
}

/** Horizontal flex row. Wraps at narrow widths. */
export function Row({
  gap = 2,
  justify = 'start',
  align = 'baseline',
  pad = false,
  wrap = 'always',
  shrink = true,
  children,
}: RowProps) {
  const cls = [
    'flex min-w-0 flex-row',
    wrap === 'narrow' ? 'flex-wrap @xl:flex-nowrap' : 'flex-wrap',
    shrink ? '' : 'flex-none',
    GAPS[gap],
    justify === 'between' ? 'justify-between' : 'justify-start',
    align === 'center' ? 'items-center' : align === 'start' ? 'items-start' : 'items-baseline',
    pad ? 'border-b border-line bg-card px-4 py-2' : '',
  ]
  return <div className={cls.join(' ')}>{children}</div>
}
