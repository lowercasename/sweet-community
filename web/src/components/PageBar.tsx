import type { ReactNode } from 'react'
import { Button, Heading, Row } from '../ui'

interface PageBarProps {
  /** The view's title, for example Home, a group's name or a page's name. */
  title: string
  /** On a page nested under another view, such as a group's members or a post, the back button to that view. */
  back?: { label: string; onClick: () => void }
  /** The bar's controls, shown on the right. */
  children?: ReactNode
}

/**
 * The bar across the top of every view, on both
 * phone and desktop. It shows the view's title, a back button when the view
 * is nested under another view, and the view's controls. The controls never
 * wrap. The title shrinks first and is truncated to one line. On a phone the
 * controls are icons. Pages do not render a title of their own.
 */
export function PageBar({ title, back, children }: PageBarProps) {
  return (
    <Row justify="between" align="center" pad wrap="never">
      <Row gap={1} align="center" wrap="never">
        {back && <Button variant="ghost" icon="back" label={back.label} onClick={back.onClick} />}
        <Heading level={2} truncate>
          {title}
        </Heading>
      </Row>
      <Row gap={1} align="center" wrap="never" shrink={false}>
        {children}
      </Row>
    </Row>
  )
}
