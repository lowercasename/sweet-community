import { useState } from 'react'
import type { Message } from '../api'
import { useAuthor } from '../data/hooks'
import { useStreamStatus } from '../hooks/StreamContext'
import {
  Alert,
  Box,
  ItemBlock,
  ReadPoint,
  Button,
  Time,
  ConfirmDialog,
  Menu,
  ReplyQuote,
  Row,
  shieldText,
  Stack,
  Text,
} from '../ui'
import { Body } from './Body'
import { PersonName } from './PersonName'
import { AddReaction, Reactions, useToggleReaction } from './Reactions'
import { ReportDialog } from './ReportDialog'

interface MessageGroupProps {
  /** Consecutive messages from one user on the same day. Contains at least one message. */
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
 * A run of messages by one user. The avatar and name are shown once, with the first message’s time, followed by the
 * message bodies. Each message has its reactions under its body, and its actions (Add reaction, Reply and a menu) in
 * the bar of its block (ItemBlock).
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
  // The message whose action bar has a menu or picker open, which keeps the bar shown.
  const [opened, setOpened] = useState<string | null>(null)
  const [reactionError, setReactionError] = useState<{ id: string; text: string } | null>(null)
  const toggleReaction = useToggleReaction()
  const offline = useStreamStatus() === 'offline'
  const react = async (m: Message, emoji: string) => {
    const error = await toggleReaction('message', m.id, m.reactions, emoji)
    setReactionError(error ? { id: m.id, text: error } : null)
  }
  const openChange = (id: string) => (open: boolean) => setOpened((now) => (open ? id : now === id ? null : now))

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
            <Time at={first.created_at} format="time" />
          </Text>
        </Row>
        {messages.map((m) => (
          <ItemBlock
            key={m.id}
            id={`message-${m.id}`}
            highlight={highlight === m.id}
            actionsOpen={opened === m.id}
            actions={
              <>
                <AddReaction
                  compact
                  disabled={offline}
                  onPick={(emoji) => void react(m, emoji)}
                  onOpenChange={openChange(m.id)}
                />
                {onReply && (
                  <Button
                    variant="ghost"
                    icon="reply"
                    label="Reply to this message"
                    compact
                    onClick={() => onReply(m)}
                  />
                )}
                {(m.can.delete || m.can.report) && (
                  <Menu
                    label="Message options"
                    compact
                    onOpenChange={openChange(m.id)}
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
                  />
                )}
              </>
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
            <Reactions reactions={m.reactions} disabled={offline} onToggle={(emoji) => void react(m, emoji)} />
            {reactionError?.id === m.id && <Alert tone="error">{reactionError.text}</Alert>}
            <ReadPoint at={m.created_at} />
          </ItemBlock>
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
