import { useState } from 'react'
import type { Post as PostData, User } from '../api'
import { postExtensions } from '../editor/extensions'
import { Avatar, Button, Card, HtmlContent, Icon, Row, Stack, Text, Time } from '../ui'
import { BodyEditor } from './BodyEditor'
import { CommentThread } from './CommentThread'

interface PostProps {
  post: PostData
  me: User
  /** True while offline; disables saving. */
  disabled: boolean
  /** Resolves when the server has stored the new body. */
  onEdit: (bodyHtml: string) => Promise<void>
}

export function Post({ post, me, disabled, onEdit }: PostProps) {
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const mine = post.author.id === me.id

  const save = async (bodyHtml: string) => {
    await onEdit(bodyHtml)
    setEditing(false)
  }

  return (
    <Card as="article">
      <Stack gap={2}>
        <Row justify="between" align="center">
          <Row gap={2} align="center">
            <Avatar name={post.author.username} picture={post.author.picture} />
            <Text as="span" variant="name">
              {post.author.username}
            </Text>
            <Text as="span" variant="small">
              <Time at={post.created_at} />
              {post.edited_at != null && (
                <>
                  {' · edited '}
                  <Time at={post.edited_at} />
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
        {open && <CommentThread postId={post.id} me={me} disabled={disabled} />}
      </Stack>
    </Card>
  )
}
