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
  /** `end` is used for a submit button alone at the bottom of a form. */
  justify?: 'start' | 'between' | 'end'
  /** `end` aligns a control with the bottom of a labelled field beside it. */
  align?: 'baseline' | 'center' | 'start' | 'end'
  /** Style as a bar across the top of a pane. Padded, with a hairline under it. */
  pad?: boolean
  /**
   * `always` wraps whenever the children's natural widths overflow, because
   * flex wraps before it shrinks. `narrow` stays on one line and lets the
   * children shrink while the nearest CSS container (a ListItem) is at least
   * 36rem wide, and wraps below that width. Used for a list row with actions
   * on the right. `never` always stays on one line, and a child that may
   * shrink (HtmlContent fill) takes the remaining width. Used for a message
   * body with its menu beside it.
   */
  wrap?: 'always' | 'narrow' | 'never'
  /** When false, the row never shrinks, so a group of action buttons keeps its buttons intact. */
  shrink?: boolean
  /** Push the row to the end of its line, so a group of action buttons that wraps onto its own line stays right-aligned. */
  push?: 'end'
  children?: ReactNode
}

/** A horizontal flex row. Wraps at narrow widths. */
export function Row({
  gap = 2,
  justify = 'start',
  align = 'baseline',
  pad = false,
  wrap = 'always',
  shrink = true,
  push,
  children,
}: RowProps) {
  const cls = [
    'flex min-w-0 flex-row',
    wrap === 'narrow' ? 'flex-wrap @xl:flex-nowrap' : wrap === 'never' ? 'flex-nowrap' : 'flex-wrap',
    shrink ? '' : 'flex-none',
    push === 'end' ? 'ml-auto' : '',
    GAPS[gap],
    justify === 'between' ? 'justify-between' : justify === 'end' ? 'justify-end' : 'justify-start',
    align === 'center'
      ? 'items-center'
      : align === 'start'
        ? 'items-start'
        : align === 'end'
          ? 'items-end'
          : 'items-baseline',
    pad ? 'border-b border-line bg-card px-4 py-2' : '',
  ]
  return <div className={cls.join(' ')}>{children}</div>
}
