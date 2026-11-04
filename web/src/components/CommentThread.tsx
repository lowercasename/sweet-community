import { useState } from 'react'
import type { Comment as CommentData } from '../api'
import { useAuthor, useCommentActions, useComments } from '../data/hooks'
import { commentExtensions } from '../editor/extensions'
import {
  Avatar,
  Box,
  ConfirmDialog,
  Hairline,
  HtmlContent,
  Menu,
  Row,
  Stack,
  Text,
  Time,
  type MenuItem,
} from '../ui'
import { BodyEditor } from './BodyEditor'

interface CommentThreadProps {
  postId: string
  disabled: boolean
}

interface CommentItemProps {
  comment: CommentData
  disabled: boolean
  onEdit: (bodyHtml: string) => Promise<void>
  onDelete: () => Promise<void>
}

function CommentItem({ comment, disabled, onEdit, onDelete }: CommentItemProps) {
  const author = useAuthor(comment.author)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  if (comment.can.delete) items.push({ label: 'Delete', icon: 'trash', onSelect: () => setConfirming(true) })

  return (
    <Box as="article">
      <Stack gap={1}>
        <Row justify="between" align="center">
          <Row gap={2} align="center">
            <Avatar name={author.username} picture={author.picture} size="sm" />
            <Text as="span" variant="name">
              {author.username}
            </Text>
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
          {items.length > 0 && !editing && !disabled && <Menu label="Comment options" items={items} />}
        </Row>
        {editing ? (
          <BodyEditor
            extensions={commentExtensions}
            size="line"
            submitLabel="Save"
            busyLabel="Saving…"
            initialHtml={comment.body_html}
            disabled={disabled}
            onSubmit={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <HtmlContent html={comment.body_html} />
        )}
        {error && <Text variant="secondary">{error}</Text>}
      </Stack>
      <ConfirmDialog
        open={confirming}
        title="Delete this comment?"
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirming(false)}
      >
        <Text variant="secondary">This action cannot be undone.</Text>
      </ConfirmDialog>
    </Box>
  )
}

/** Flat comments under a post, oldest first, with the reply editor at the end. */
export function CommentThread({ postId, disabled }: CommentThreadProps) {
  const { comments, loading, error } = useComments(postId)
  const { create, edit, remove } = useCommentActions(postId)

  return (
    <Stack gap={2}>
      <Hairline />
      {loading && <Text variant="secondary">Loading comments…</Text>}
      {error && <Text variant="secondary">{error.message}</Text>}
      {comments.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          disabled={disabled}
          onEdit={(html) => edit(c.id, html)}
          onDelete={() => remove(c.id)}
        />
      ))}
      <BodyEditor
        extensions={commentExtensions}
        size="line"
        submitLabel="Reply"
        busyLabel="Replying…"
        disabled={disabled}
        onSubmit={create}
      />
    </Stack>
  )
}
