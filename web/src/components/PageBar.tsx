import type { ReactNode } from 'react'
import { Button, Heading, Row } from '../ui'

interface PageBarProps {
  /** The view's name: Home, a room, a page. */
  title: string
  /** From a page under something (a room's members, a post): the way back to it. */
  back?: { label: string; onClick: () => void }
  /** The bar's controls, on the right. */
  children?: ReactNode
}

/**
 * The bar across the top of every view (architecture.md, Layout), on the
 * phone and the desktop alike: its name, a way back when it sits under
 * something, and its controls, which never wrap: the title gives way first,
 * cut to one line. On a phone the controls are icons. Pages keep no title of
 * their own.
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
