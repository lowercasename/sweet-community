import type { ReactNode } from 'react'

interface HeadingProps {
  level: 1 | 2 | 3
  /** Keep to one line and truncate with an ellipsis. Used for a bar's title beside its controls. */
  truncate?: boolean
  children?: ReactNode
}

/** Headings in the app chrome. The h1 is the wordmark. Headings inside post bodies are styled by .content. */
export function Heading({ level, truncate = false, children }: HeadingProps) {
  const cut = truncate ? ' min-w-0 truncate' : ''
  if (level === 1) return <h1 className={`m-0 text-[20px] font-bold leading-tight text-sweet${cut}`}>{children}</h1>
  if (level === 2) return <h2 className={`m-0 text-[18px] font-bold leading-tight text-ink${cut}`}>{children}</h2>
  return <h3 className={`m-0 text-[16px] font-medium leading-tight text-ink${cut}`}>{children}</h3>
}
