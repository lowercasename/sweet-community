import { useEffect, useState } from 'react'
import { createComment, getComments, updateComment, type Comment as CommentData, type User } from '../api'
import { commentExtensions } from '../editor/extensions'
import { useStreamEvents } from '../hooks/StreamContext'
import { Avatar, Box, Button, Card, Hairline, HtmlContent, Icon, Row, Stack, Text, Time } from '../ui'
import { BodyEditor } from './BodyEditor'

interface CommentThreadProps {
  postId: string
  me: User
  disabled: boolean
}

function isComment(data: unknown): data is CommentData {
  return typeof data === 'object' && data !== null && typeof (data as CommentData).post_id === 'string'
}

interface CommentItemProps {
  comment: CommentData
  mine: boolean
  disabled: boolean
  onEdit: (bodyHtml: string) => Promise<void>
}

function CommentItem({ comment, mine, disabled, onEdit }: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const save = async (bodyHtml: string) => {
    await onEdit(bodyHtml)
    setEditing(false)
  }
  return (
    <Box as="article">
      <Stack gap={1}>
        <Row justify="between" align="center">
          <Row gap={2} align="center">
            <Avatar name={comment.author.username} size="sm" />
            <Text as="span" variant="name">
              {comment.author.username}
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
          {mine && !editing && (
            <Button variant="ghost" label="Edit" onClick={() => setEditing(true)}>
              <Icon name="pencil" />
            </Button>
          )}
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
          <Card tone="field">
            <HtmlContent html={comment.body_html} />
          </Card>
        )}
      </Stack>
    </Box>
  )
}

/** Flat comments under a post, oldest first, with the reply editor at the end. */
export function CommentThread({ postId, me, disabled }: CommentThreadProps) {
  const [comments, setComments] = useState<CommentData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const upsert = (list: CommentData[], c: CommentData): CommentData[] => {
    if (list.some((x) => x.id === c.id)) return list.map((x) => (x.id === c.id ? c : x))
    return [...list, c].sort((a, b) => a.created_at - b.created_at)
  }

  useStreamEvents((kind, data) => {
    if ((kind === 'comment' || kind === 'comment_edit') && isComment(data) && data.post_id === postId) {
      setComments((prev) => upsert(prev, data))
    }
  })

  useEffect(() => {
    let cancelled = false
    getComments(postId)
      .then((r) => {
        if (!cancelled) setComments((prev) => r.comments.reduce(upsert, prev))
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load comments')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [postId])

  const reply = async (bodyHtml: string) => {
    const c = await createComment(postId, bodyHtml)
    setComments((prev) => upsert(prev, c))
  }

  const edit = async (id: string, bodyHtml: string) => {
    const c = await updateComment(id, bodyHtml)
    setComments((prev) => upsert(prev, c))
  }

  return (
    <Stack gap={2}>
      <Hairline />
      {loading && <Text variant="secondary">Loading comments…</Text>}
      {error && <Text variant="secondary">{error}</Text>}
      {comments.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          mine={c.author.id === me.id}
          disabled={disabled}
          onEdit={(html) => edit(c.id, html)}
        />
      ))}
      <BodyEditor
        extensions={commentExtensions}
        size="line"
        submitLabel="Reply"
        busyLabel="Replying…"
        disabled={disabled}
        onSubmit={reply}
      />
    </Stack>
  )
}
