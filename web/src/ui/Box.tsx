import { forwardRef, type ElementType, type ReactNode } from 'react'

type BoxAs = 'div' | 'section' | 'article' | 'header' | 'footer' | 'main' | 'nav'

interface BoxProps {
  as?: BoxAs
  children?: ReactNode
}

/**
 * An unstyled block container. The only place a bare div, section, article and so on is written. An article (a
 * comment) has the `block-comment` class, so hovering a comment does not show its post's menu (REVEAL_POST).
 */
export const Box = forwardRef<HTMLDivElement, BoxProps>(function Box({ as = 'div', children }, ref) {
  const Tag: ElementType = as
  return (
    <Tag ref={ref} className={as === 'article' ? 'block-comment' : undefined}>
      {children}
    </Tag>
  )
})
