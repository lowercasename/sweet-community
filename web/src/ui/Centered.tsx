import type { ReactNode } from 'react'

interface CenteredProps {
  /** Rendered above the children, inset by the card's padding so it aligns with the card's text. */
  head?: ReactNode
  /** Rendered below the children, with the same inset. */
  foot?: ReactNode
  children?: ReactNode
}

/**
 * A narrow column centred on the page, for sign-in and join. The head and foot
 * are inset by 16px, the card's padding, so the heading, the card's text and
 * the foot share one left edge.
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
