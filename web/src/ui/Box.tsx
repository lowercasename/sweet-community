import type { ElementType, ReactNode } from 'react'

type BoxAs = 'div' | 'section' | 'article' | 'header' | 'footer' | 'main' | 'nav'

interface BoxProps {
  as?: BoxAs
  className?: string
  children?: ReactNode
}

/** Generic block container. The only place a bare div/section/article/etc. is written. */
export function Box({ as = 'div', className, children }: BoxProps) {
  const Tag: ElementType = as
  return <Tag className={className}>{children}</Tag>
}
