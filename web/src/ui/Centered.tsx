import type { ReactNode } from 'react'

interface CenteredProps {
  /** Above the column's card, on the card's own text line. */
  head?: ReactNode
  /** Below it, on the same line. */
  foot?: ReactNode
  children?: ReactNode
}

/**
 * A narrow column centred on the paper, for sign-in and join. The head and
 * the foot are inset by the card's padding, so the three left edges of text
 * are one edge.
 */
export function Centered({ head, foot, children }: CenteredProps) {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-[380px] flex-col gap-4">
        {head && <div className="px-4">{head}</div>}
        {children}
        {foot && <div className="px-4">{foot}</div>}
      </div>
    </main>
  )
}
