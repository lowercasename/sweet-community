import type { ReactNode } from 'react'

interface ListRowProps {
  /** The row's accessible name. Names what the row opens. */
  label: string
  onClick?: () => void
  children?: ReactNode
}

/** A list row that is one button, for a row that opens something. Used for a conversation on the Messages page. */
export function ListRow({ label, onClick, children }: ListRowProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[4px] px-2 py-2 text-left text-ink transition-colors hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
