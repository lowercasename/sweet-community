import type { ReactNode } from 'react'
import { Bar, Heading, Row, Text } from '../ui'

interface HeaderProps {
  username: string | null
  /** Pane switches, rendered between the title and the username. */
  actions?: ReactNode
}

export function Header({ username, actions }: HeaderProps) {
  return (
    <Bar as="header" edge="bottom">
      <Row justify="between" align="baseline">
        <Heading level={1}>Sweet</Heading>
        <Row gap={3} align="baseline">
          {actions}
          {username && <Text as="span" variant="secondary">{username}</Text>}
        </Row>
      </Row>
    </Bar>
  )
}
