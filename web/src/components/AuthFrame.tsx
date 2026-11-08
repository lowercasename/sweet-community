import type { ReactNode } from 'react'
import { Card, Centered, Heading, Stack, Wordmark } from '../ui'

interface AuthFrameProps {
  /** The community's name, the page's title; Sweet until there is one. */
  name?: string
  children?: ReactNode
}

/**
 * The frame of every page a stranger may see: sign in, join, verify, reset,
 * setup. The community's name over a narrow card (Raphael, 2026-11-06:
 * these pages are about the community), and the product's mark under it,
 * small, saying what the place is made with (Raphael, 2026-11-08: the name
 * out of the card, the mark down to the credit, so the S means Sweet).
 */
export function AuthFrame({ name, children }: AuthFrameProps) {
  return (
    <Centered
      head={<Heading level={1}>{name || 'Sweet'}</Heading>}
      foot={<Wordmark size="sm" label="Made with Sweet" />}
    >
      <Card>
        <Stack gap={3}>{children}</Stack>
      </Card>
    </Centered>
  )
}
