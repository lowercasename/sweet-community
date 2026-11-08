import type { ReactNode } from 'react'

/** A full-width strip between a page's bar and its panes, with the page's side gutter. It holds a notice. */
export function Strip({ children }: { children?: ReactNode }) {
  return <div className="flex-none px-4 pt-3">{children}</div>
}
