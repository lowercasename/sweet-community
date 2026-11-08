import { useState } from 'react'
import { createReport, type ReportKind } from '../api'
import { Alert, ConfirmDialog, Field, Stack, Text, Textarea } from '../ui'

interface ReportDialogProps {
  kind: ReportKind
  /** The id of the post, comment or message. */
  id: string
  /** The username of the item's author. The text tells the reporter that this user will not learn who reported. */
  author: string
  /** True for a message in a conversation. Moderators cannot read conversations, so the text says they will see it. */
  conversation?: boolean
  open: boolean
  onClose: () => void
}

const NOUN: Record<ReportKind, string> = { post: 'post', comment: 'comment', message: 'message' }
const TITLE: Record<ReportKind, string> = { post: 'Post', comment: 'Comment', message: 'Message' }

/** The longest reason the server accepts. */
const MAX_REASON = 500

/**
 * Reports a post, comment or message to the owner and moderators (architecture.md, Admin tools). The reason is
 * optional. After the report is sent, the dialog says so and offers Done. The same dialog serves posts, comments and
 * messages.
 */
export function ReportDialog({ kind, id, author, conversation = false, open, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const noun = NOUN[kind]

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await createReport(kind, id, reason.trim())
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the report')
    } finally {
      setBusy(false)
    }
  }
  const close = () => {
    setReason('')
    setError(null)
    setSent(false)
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      title={sent ? `${TITLE[kind]} reported` : `Report this ${noun}?`}
      confirmLabel={`Report ${noun}`}
      busy={busy}
      done={sent}
      onConfirm={() => void send()}
      onClose={close}
    >
      {sent ? (
        <Text variant="secondary">Thank you. The moderators will look at it.</Text>
      ) : (
        <Stack gap={3}>
          <Text variant="secondary">
            {conversation
              ? `Moderators look after the community. They cannot read private conversations, but they will see this ${noun} and your report text. ${author} will not be told who reported it.`
              : `Moderators look after the community. They will see this ${noun} and your report text. ${author} will not be told who reported it.`}
          </Text>
          <Field label="What's wrong?" hint="Optional.">
            <Textarea value={reason} onChange={setReason} maxLength={MAX_REASON} rows={3} />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
        </Stack>
      )}
    </ConfirmDialog>
  )
}
