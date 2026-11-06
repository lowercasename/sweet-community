import type { ReactNode } from 'react'
import { Card, Centered, Stack, Text, Wordmark } from '../ui'

interface AuthFrameProps {
  /** The community's name, worn by the mark; the mark alone says Sweet until there is one. */
  name?: string
  children?: ReactNode
}

/**
 * The frame of every page a stranger may see: sign in, join, verify, reset,
 * setup. A narrow card wearing the community's name (Raphael, 2026-11-06:
 * these pages are about the community), with the product named small under it.
 */
export function AuthFrame({ name, children }: AuthFrameProps) {
  return (
    <Centered>
      <Stack gap={3}>
        <Card>
          <Stack gap={3}>
            <Wordmark expanded name={name} />
            {children}
          </Stack>
        </Card>
        <Text variant="small">Made with Sweet</Text>
      </Stack>
    </Centered>
  )
}
