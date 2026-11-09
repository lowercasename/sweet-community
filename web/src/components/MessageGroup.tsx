import { useState } from 'react'
import type { Message } from '../api'
import { useAuthor } from '../data/hooks'
import { Box, Button, ConfirmDialog, Menu, MessageBlock, ReplyQuote, Row, shieldText, Stack, Text, Time } from '../ui'
import { Body } from './Body'
import { PersonName } from './PersonName'
import { ReportDialog } from './ReportDialog'

interface MessageGroupProps {
  /** Consecutive messages from one user within a few minutes. Contains at least one message. */
  messages: Message[]
  /** Resolves when the server has deleted the message. The message is then removed from the query cache. */
  onDelete: (id: string) => Promise<void>
  /** Attaches a message to the chat editor as the message being replied to. Without it, no Reply button is shown. */
  onReply?: (m: Message) => void
  /** Scrolls to a message by id, from a reply's quote. */
  onJump?: (id: string) => void
  /** The id of the message to highlight briefly, after a quote was clicked. */
  highlight?: string | null
  /** True in a conversation. The report dialog then says that moderators will see the message. */
  conversation?: boolean
}

/**
 * A run of messages by one user. The avatar, name and time are shown once,
 * followed by the message bodies close together, each in its own block. A
 * message's menu is positioned at the top right of its own block. This
 * includes the first message, whose menu is never on the author's line. The
 * block gets the blush background while hovered (Raphael, 2026-11-06).
 */
export function MessageGroup({
  messages,
  onDelete,
  onReply,
  onJump,
  highlight,
  conversation = false,
}: MessageGroupProps) {
  const first = messages[0]
  const author = useAuthor(first.author)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [reporting, setReporting] = useState<string | null>(null)

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
            id={`message-${m.id}`}
            highlight={highlight === m.id}
            menu={
              onReply || m.can.delete || m.can.report ? (
                <>
                  {onReply && (
                    <Button
                      variant="ghost"
                      icon="reply"
                      label="Reply to this message"
                      compact
                      reveal="message"
                      onClick={() => onReply(m)}
                    />
                  )}
                  {(m.can.delete || m.can.report) && (
                    <Menu
                      label="Message options"
                      items={[
                        ...(m.can.report
                          ? [{ label: 'Report', icon: 'flag' as const, onSelect: () => setReporting(m.id) }]
                          : []),
                        ...(m.can.delete
                          ? [
                              {
                                label: 'Delete',
                                icon: 'trash' as const,
                                danger: true,
                                shield: m.can.delete_by_role ? shieldText.rolesDo : undefined,
                                onSelect: () => setConfirming(m.id),
                              },
                            ]
                          : []),
                      ]}
                      reveal="message"
                    />
                  )}
                </>
              ) : undefined
            }
          >
            {m.reply_to && (
              <ReplyQuote
                author={m.reply_to.author?.username}
                text={m.reply_to.text}
                deleted={m.reply_to.deleted}
                onClick={onJump ? () => onJump(m.reply_to!.id) : undefined}
              />
            )}
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
      <ReportDialog
        kind="message"
        id={reporting ?? ''}
        author={author.username}
        conversation={conversation}
        open={reporting !== null}
        onClose={() => setReporting(null)}
      />
    </Box>
  )
}
