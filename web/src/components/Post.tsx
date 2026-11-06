import { useState } from 'react'
import type { Post as PostData } from '../api'
import { useAuthor } from '../data/hooks'
import { postExtensions } from '../editor/extensions'
import { postPath } from '../routes'
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  HtmlContent,
  Link,
  Menu,
  type MenuItem,
  Row,
  Stack,
  Text,
  Time,
} from '../ui'
import { BodyEditor } from './BodyEditor'
import { CommentThread } from './CommentThread'
import { PersonName } from './PersonName'

interface PostProps {
  post: PostData
  /** The time links to the post's own page; false on that page. */
  linked?: boolean
  /** Start with the thread open (the post's page). */
  expanded?: boolean
  /** True while offline; disables saving. */
  disabled: boolean
  /** Resolves when the server has stored the new body. */
  onEdit: (bodyHtml: string) => Promise<void>
  /** Resolves when the server has deleted the post; the cache drops it. */
  onDelete: () => Promise<void>
}

export function Post({ post, linked = true, expanded = false, disabled, onEdit, onDelete }: PostProps) {
  const author = useAuthor(post.author)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(expanded)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const save = async (bodyHtml: string) => {
    await onEdit(bodyHtml)
    setEditing(false)
  }

  const remove = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete the post')
      setConfirming(false)
    } finally {
      setDeleting(false)
    }
  }

  // What this person may do is the server's call, carried on the post.
  const items: MenuItem[] = []
  if (post.can.edit) items.push({ label: 'Edit', icon: 'pencil', onSelect: () => setEditing(true) })
  if (post.can.delete) items.push({ label: 'Delete', icon: 'trash', onSelect: () => setConfirming(true) })

  const when = (
    <>
      <Time at={post.created_at} />
      {post.edited_at != null && (
        <>
          {' · edited '}
          <Time at={post.edited_at} />
        </>
      )}
    </>
  )

  return (
    <Card as="article">
      <Stack gap={2}>
        <Row justify="between" align="center">
          <Row gap={2} align="center">
            <PersonName user={author} avatar="md" />
            <Text as="span" variant="small">
              {linked ? <Link href={postPath(post.id)}>{when}</Link> : when}
            </Text>
          </Row>
          {items.length > 0 && !editing && !disabled && <Menu label="Post options" items={items} />}
        </Row>
        {editing ? (
          // The stored HTML is the editor's input: no separate document format.
          <BodyEditor
            key={post.edited_at ?? 0}
            extensions={postExtensions}
            size="post"
            submitLabel="Save"
            busyLabel="Saving…"
            initialHtml={post.body_html}
            disabled={disabled}
            onSubmit={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <HtmlContent html={post.body_html} />
        )}
        {deleteError && <Alert tone="error">{deleteError}</Alert>}
        <Row>
          <Button
            variant="ghost"
            icon="comment"
            count={post.comment_count}
            label={open ? 'Hide comments' : 'Show comments'}
            pressed={open}
            onClick={() => setOpen((o) => !o)}
          />
        </Row>
        {open && <CommentThread postId={post.id} groupId={post.group_id} disabled={disabled} />}
      </Stack>
      <ConfirmDialog
        open={confirming}
        title="Delete this post?"
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirming(false)}
      >
        <Text variant="secondary">
          This will also delete all the comments made on this post. This action cannot be undone.
        </Text>
      </ConfirmDialog>
    </Card>
  )
}
