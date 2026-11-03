import type { ReactNode } from 'react'
import { Bar, Bee, Heading, Row, Text } from '../ui'

interface HeaderProps {
  username: string | null
  /** Pane switches, rendered between the wordmark and the username. */
  actions?: ReactNode
}

export function Header({ username, actions }: HeaderProps) {
  return (
    <Bar as="header" edge="header">
      <Row justify="between" align="center">
        <Heading level={1}>
          <Bee /> Sweet
        </Heading>
        <Row gap={3} align="baseline">
          {actions}
          {username && <Text as="span" variant="secondary">{username}</Text>}
        </Row>
      </Row>
    </Bar>
  )
}
