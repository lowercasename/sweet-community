import type { ReactNode } from 'react'
import { Card, Centered, Heading, Stack, Wordmark } from '../ui'

interface AuthFrameProps {
  /** The community's name, used as the page heading. Defaults to "Sweet" before the community is named. */
  name?: string
  children?: ReactNode
}

/**
 * The layout of every page shown to a user who is not signed in. These are
 * the sign-in, join, verify, reset and setup pages. The community's name is
 * the heading above a narrow card, because these pages are about the
 * community. A small "Made with Sweet" wordmark is
 * shown under the card. The name was moved out of the card and the mark was
 * moved down to the credit, so the page shows one S and it refers to Sweet.
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
