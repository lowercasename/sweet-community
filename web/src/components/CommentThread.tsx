import { useState } from 'react'
import type { Comment as CommentData } from '../api'
import { useAuthor, useCommentActions, useComments } from '../data/hooks'
import { commentExtensions } from '../editor/extensions'
import {
  Alert,
  Box,
  Card,
  ConfirmDialog,
  Hairline,
  Menu,
  type MenuItem,
  Row,
  shieldText,
  Stack,
  Text,
  Time,
} from '../ui'
import { Body } from './Body'
import { BodyEditor } from './BodyEditor'
import { PersonName } from './PersonName'
import { ReportDialog } from './ReportDialog'

interface CommentThreadProps {
  postId: string
  groupId: string
  /** The post's author, shown as the user a reply is addressed to. */
  replyTo: string
  disabled: boolean
}

interface CommentItemProps {
  comment: CommentData
  groupId: string
  disabled: boolean
  onEdit: (bodyHtml: string) => Promise<void>
  onDelete: () => Promise<void>
}

function CommentItem({ comment, groupId, disabled, onEdit, onDelete }: CommentItemProps) {
  const author = useAuthor(comment.author)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const save = async (bodyHtml: string) => {
    await onEdit(bodyHtml)
    setEditing(false)
  }
  const remove = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the comment')
      setConfirming(false)
    } finally {
      setDeleting(false)
    }
  }

  const items: MenuItem[] = []
  if (comment.can.edit) items.push({ label: 'Edit', icon: 'pencil', onSelect: () => setEditing(true) })
  if (comment.can.report) items.push({ label: 'Report', icon: 'flag', onSelect: () => setReporting(true) })
  if (comment.can.delete)
    items.push({
      label: 'Delete',
      icon: 'trash',
      danger: true,
      shield: comment.can.delete_by_role ? shieldText.rolesDo : undefined,
      onSelect: () => setConfirming(true),
    })

  return (
    <Box as="article">
      <Stack gap={1}>
        <Row justify="between" align="center">
          <Row gap={2} align="center">
            <PersonName user={author} avatar="xs" small />
            <Text as="span" variant="small">
              <Time at={comment.created_at} />
              {comment.edited_at != null && (
                <>
                  {' · edited '}
                  <Time at={comment.edited_at} />
                </>
              )}
            </Text>
          </Row>
          {items.length > 0 && !editing && !disabled && <Menu label="Comment options" items={items} reveal="comment" />}
        </Row>
        {editing ? (
          <BodyEditor
            groupId={groupId}
            extensions={commentExtensions}
            size="line"
            submitLabel="Save"
            initialHtml={comment.body_html}
            draft={`comment-edit:${comment.id}`}
            disabled={disabled}
            onSubmit={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <Body html={comment.body_html} size="small" />
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </Stack>
      <ConfirmDialog
        open={confirming}
        title="Delete this comment?"
        confirmLabel="Delete"
        icon="trash"
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirming(false)}
      >
        <Text variant="secondary">This action cannot be undone.</Text>
      </ConfirmDialog>
      <ReportDialog
        kind="comment"
        id={comment.id}
        author={author.username}
        open={reporting}
        onClose={() => setReporting(false)}
      />
    </Box>
  )
}

/**
 * The comment thread under a post. It is a grey
 * panel with its own background. The panel contains the comments, oldest
 * first, with a hairline between each, and the reply editor at the bottom.
 * The reply editor is the only white element in the panel.
 */
export function CommentThread({ postId, groupId, replyTo, disabled }: CommentThreadProps) {
  const { comments, loading, error } = useComments(postId)
  const { create, edit, remove } = useCommentActions(postId, groupId)

  return (
    <Card tone="field">
      <Stack gap={3}>
        {(loading || error || comments.length > 0) && (
          <Stack gap={2}>
            {loading && <Text variant="secondary">Loading comments…</Text>}
            {error && <Alert tone="error">{error.message}</Alert>}
            {comments.map((c, i) => (
              <Box key={c.id}>
                <Stack gap={2}>
                  {i > 0 && <Hairline />}
                  <CommentItem
                    groupId={groupId}
                    comment={c}
                    disabled={disabled}
                    onEdit={(html) => edit(c.id, html)}
                    onDelete={() => remove(c.id)}
                  />
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
        <BodyEditor
          groupId={groupId}
          extensions={commentExtensions}
          size="line"
          placeholder={`Reply to ${replyTo}…`}
          submitLabel="Reply"
          disabled={disabled}
          onSubmit={create}
          draft={`comment:${postId}`}
        />
      </Stack>
    </Card>
  )
}
