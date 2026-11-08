import type { ReactNode } from 'react'

/** A bordered box for a long body shown inside a form, such as the rules on the join page. It scrolls when long. */
export function Inset({ children }: { children?: ReactNode }) {
  return <div className="max-h-64 overflow-y-auto rounded-[4px] border border-line px-3 py-2">{children}</div>
}
