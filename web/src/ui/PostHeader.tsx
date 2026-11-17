import type { ReactNode } from 'react'

/** A post's destination and pin status share one centred header row. */
export function PostHeader({ children }: { children: ReactNode }) {
  return <div className="flex min-h-6 min-w-0 items-center gap-2 text-sm leading-5">{children}</div>
}
