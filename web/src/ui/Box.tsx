import type { ElementType, ReactNode } from 'react'

type BoxAs = 'div' | 'section' | 'article' | 'header' | 'footer' | 'main' | 'nav'

interface BoxProps {
  as?: BoxAs
  children?: ReactNode
}

/** Unstyled block container; the only place a bare div/section/article/etc. is written. An article (a comment) is a `block-comment`: its revealed Menu shows while it is hovered (ui/Menu). */
export function Box({ as = 'div', children }: BoxProps) {
  const Tag: ElementType = as
  return <Tag className={as === 'article' ? 'block-comment' : undefined}>{children}</Tag>
}
