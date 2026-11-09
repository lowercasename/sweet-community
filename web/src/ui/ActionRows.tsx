import type { ReactNode } from 'react'

interface ActionRowsProps {
  children?: ReactNode
}

/**
 * A list of action rows: each row is one thing the user can do or turn on. Rows are
 * separated by hairlines. Destructive actions are action rows in the last card of a page, ordered from the least to
 * the most consequential (pattern 3).
 */
export function ActionRows({ children }: ActionRowsProps) {
  return <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">{children}</ul>
}

interface ActionRowProps {
  /** The row's name. Left out when the card holds one row and the button's words already name it. */
  title?: string
  /** One sentence on what the action does, or why it is not available. */
  children?: ReactNode
  /** One button. Absent when the action is not available, and the description says why. */
  action?: ReactNode
}

/**
 * One action row: the title and description on the left, one button on the right. When the row is too narrow, the
 * button wraps below the text and stays at the right.
 */
export function ActionRow({ title, children, action }: ActionRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-[1_1_16rem]">
        {title && <div className="font-medium text-ink">{title}</div>}
        {children && <div className={title ? 'text-[15px] text-mute' : 'text-mute'}>{children}</div>}
      </div>
      {action && <div className="ml-auto flex flex-none">{action}</div>}
    </li>
  )
}
