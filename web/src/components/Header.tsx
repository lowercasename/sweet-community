import type { ReactNode } from 'react'
import { Bar, Heading, Row, Text } from '../ui'

interface HeaderProps {
  username: string | null
  /** Pane controls, rendered between the wordmark and the username. */
  actions?: ReactNode
}

export function Header({ username, actions }: HeaderProps) {
  return (
    <Bar as="header" edge="header">
      <Row justify="between" align="center">
        <Heading level={1}>Sweet</Heading>
        <Row gap={3} align="center">
          {actions}
          {username && (
            <Text as="span" variant="secondary">
              {username}
            </Text>
          )}
        </Row>
      </Row>
    </Bar>
  )
}
