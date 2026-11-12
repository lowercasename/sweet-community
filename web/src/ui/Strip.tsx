import type { ReactNode } from 'react'

/**
 * A full-width strip between a page's bar and its panes. It holds a notice. On a phone its side padding is a Pane's
 * padding plus its ScrollArea's, so the notice lines up with the cards below it.
 */
export function Strip({ children }: { children?: ReactNode }) {
  return <div className="flex-none px-4 pt-3 phone:px-3">{children}</div>
}
