import type { ReactNode } from 'react'
import { Card, Centered, Heading, Stack, Wordmark } from '../ui'

interface AuthFrameProps {
  /** The community's name, used as the page heading. Defaults to "Sweet" before the community is named. */
  name?: string
  children?: ReactNode
}

/**
 * The layout of every page shown to someone who is not signed in: sign in,
 * join, verify, reset, setup. The community's name is the heading above a
 * narrow card (Raphael, 2026-11-06: these pages are about the community). A
 * small "Made with Sweet" wordmark sits under the card (Raphael, 2026-11-08:
 * the name moved out of the card and the mark moved down to the credit, so
 * the page shows one S and it refers to Sweet).
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
