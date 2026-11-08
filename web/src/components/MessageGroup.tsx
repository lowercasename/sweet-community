import { useState } from 'react'
import type { Message } from '../api'
import { useAuthor } from '../data/hooks'
import { Box, ConfirmDialog, Menu, MessageBlock, Row, Stack, Text, Time } from '../ui'
import { Body } from './Body'
import { PersonName } from './PersonName'

interface MessageGroupProps {
  /** Consecutive messages from one user within a few minutes. Contains at least one message. */
  messages: Message[]
  /** Resolves when the server has deleted the message. The message is then removed from the query cache. */
  onDelete: (id: string) => Promise<void>
}

/**
 * A run of messages by one user. The avatar, name and time are shown once,
 * followed by the message bodies close together, each in its own block. A
 * message's menu is positioned at the top right of its own block. This
 * includes the first message, whose menu is never on the author's line. The
 * block gets the blush background while hovered (Raphael, 2026-11-06).
 */
export function MessageGroup({ messages, onDelete }: MessageGroupProps) {
  const first = messages[0]
  const author = useAuthor(first.author)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const remove = async () => {
    if (!confirming) return
    setDeleting(true)
    try {
      await onDelete(confirming)
    } finally {
      setDeleting(false)
      setConfirming(null)
    }
  }

  return (
    <Box as="article">
      <Stack gap={0}>
        <Row gap={2} align="center">
          <PersonName user={author} avatar="sm" />
          <Text as="span" variant="small">
            <Time at={first.created_at} />
          </Text>
        </Row>
        {messages.map((m) => (
          <MessageBlock
            key={m.id}
            menu={
              m.can.delete ? (
                <Menu
                  label="Message options"
                  items={[{ label: 'Delete', icon: 'trash', danger: true, onSelect: () => setConfirming(m.id) }]}
                  reveal="message"
                />
              ) : undefined
            }
          >
            <Body html={m.body_html} />
          </MessageBlock>
        ))}
      </Stack>
      <ConfirmDialog
        open={confirming !== null}
        title="Delete this message?"
        confirmLabel="Delete"
        icon="trash"
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirming(null)}
      >
        <Text variant="secondary">This action cannot be undone.</Text>
      </ConfirmDialog>
    </Box>
  )
}
