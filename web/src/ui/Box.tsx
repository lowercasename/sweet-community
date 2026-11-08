import type { ElementType, ReactNode } from 'react'

type BoxAs = 'div' | 'section' | 'article' | 'header' | 'footer' | 'main' | 'nav'

interface BoxProps {
  as?: BoxAs
  children?: ReactNode
}

/**
 * An unstyled block container. The only place a bare div, section, article and so on is written. An article (a
 * comment) has the `block-comment` class, so a revealed Menu inside it shows while it is hovered (ui/Menu).
 */
export function Box({ as = 'div', children }: BoxProps) {
  const Tag: ElementType = as
  return <Tag className={as === 'article' ? 'block-comment' : undefined}>{children}</Tag>
}
