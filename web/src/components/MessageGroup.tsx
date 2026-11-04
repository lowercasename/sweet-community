import type { Message } from '../api'
import { Avatar, Box, HtmlContent, Row, Stack, Text, Time } from '../ui'

interface MessageGroupProps {
  /** Consecutive messages from one person within a few minutes; at least one. */
  messages: Message[]
}

/** One person's run of messages: avatar, name and time once, then the bodies close together. */
export function MessageGroup({ messages }: MessageGroupProps) {
  const first = messages[0]
  return (
    <Box as="article">
      <Stack gap={1}>
        <Row gap={2} align="center">
          <Avatar name={first.author.username} picture={first.author.picture} size="sm" />
          <Text as="span" variant="name">
            {first.author.username}
          </Text>
          <Text as="span" variant="small">
            <Time at={first.created_at} />
          </Text>
        </Row>
        {messages.map((m) => (
          <HtmlContent key={m.id} html={m.body_html} />
        ))}
      </Stack>
    </Box>
  )
}
