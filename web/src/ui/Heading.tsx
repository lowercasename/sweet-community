import type { ReactNode } from 'react'

interface HeadingProps {
  level: 1 | 2 | 3
  children?: ReactNode
}

/** Chrome headings. The h1 is the wordmark. Headings inside bodies are styled by .content. */
export function Heading({ level, children }: HeadingProps) {
  if (level === 1) return <h1 className="m-0 text-[20px] font-bold leading-tight text-sweet">{children}</h1>
  if (level === 2) return <h2 className="m-0 text-[18px] font-bold leading-tight text-ink">{children}</h2>
  return <h3 className="m-0 text-[16px] font-medium leading-tight text-ink">{children}</h3>
}
