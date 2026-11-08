import type { ReactNode } from 'react'

interface MeasureProps {
  children?: ReactNode
}

/** Centres content at the reading width. */
export function Measure({ children }: MeasureProps) {
  return <div className="mx-auto w-full max-w-[680px]">{children}</div>
}
