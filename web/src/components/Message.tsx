import type { Message as MessageData } from '../api'
import { Box, HtmlContent, Row, Stack, Text, Time } from '../ui'

interface MessageProps {
  message: MessageData
  /** True when this follows another message by the same author within a few minutes. */
  continued: boolean
}

export function Message({ message, continued }: MessageProps) {
  return (
    <Box as="article">
      <Stack gap={0}>
        {!continued && (
          <Row gap={2} align="baseline">
            <Text as="span" variant="name">{message.author.username}</Text>
            <Text as="span" variant="small">
              <Time at={message.created_at} />
            </Text>
          </Row>
        )}
        <HtmlContent html={message.body_html} />
      </Stack>
    </Box>
  )
}
