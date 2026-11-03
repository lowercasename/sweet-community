import type { ElementType, ReactNode } from 'react'

type BoxAs = 'div' | 'section' | 'article' | 'header' | 'footer' | 'main' | 'nav'

interface BoxProps {
  as?: BoxAs
  children?: ReactNode
}

/** Unstyled block container; the only place a bare div/section/article/etc. is written. */
export function Box({ as = 'div', children }: BoxProps) {
  const Tag: ElementType = as
  return <Tag>{children}</Tag>
}
