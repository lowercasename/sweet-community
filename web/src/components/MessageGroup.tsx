import { useState } from 'react'
import type { Message } from '../api'
import { useAuthor } from '../data/hooks'
import { Box, ConfirmDialog, HtmlContent, Menu, Row, Stack, Text, Time } from '../ui'
import { PersonName } from './PersonName'

interface MessageGroupProps {
  /** Consecutive messages from one person within a few minutes; at least one. */
  messages: Message[]
  /** Resolves when the server has deleted the message; the cache drops it. */
  onDelete: (id: string) => Promise<void>
}

/**
 * One person's run of messages: avatar, name and time once, then the bodies
 * close together. Each message has its own menu at the top right of its
 * block, so the first one's shares the author's line and a later one's sits
 * beside its own line (Discord's and Slack's shape). A block never wraps:
 * the body shrinks before the menu moves, however wide a picture is.
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
      <Stack gap={1}>
        {messages.map((m, i) => (
          <Row key={m.id} justify="between" align="start" wrap="never">
            <Stack gap={1} fill>
              {i === 0 && (
                <Row gap={2} align="center">
                  <PersonName user={author} avatar="sm" />
                  <Text as="span" variant="small">
                    <Time at={first.created_at} />
                  </Text>
                </Row>
              )}
              <HtmlContent html={m.body_html} />
            </Stack>
            {m.can.delete && (
              <Menu
                label="Message options"
                items={[{ label: 'Delete', icon: 'trash', onSelect: () => setConfirming(m.id) }]}
              />
            )}
          </Row>
        ))}
      </Stack>
      <ConfirmDialog
        open={confirming !== null}
        title="Delete this message?"
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirming(null)}
      >
        <Text variant="secondary">This action cannot be undone.</Text>
      </ConfirmDialog>
    </Box>
  )
}
