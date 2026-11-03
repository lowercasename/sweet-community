import { useState } from 'react'
import type { Post as PostData } from '../api'
import { Button, Card, HtmlContent, Row, Stack, Text, Time } from '../ui'
import { Composer } from './Composer'

interface PostProps {
  post: PostData
  /** True when the viewer is the author. */
  canEdit: boolean
  /** True while offline; disables saving. */
  disabled: boolean
  /** Resolves when the server has stored the new body. */
  onEdit: (bodyHtml: string) => Promise<void>
}

export function Post({ post, canEdit, disabled, onEdit }: PostProps) {
  const [editing, setEditing] = useState(false)

  const save = async (bodyHtml: string) => {
    await onEdit(bodyHtml)
    setEditing(false)
  }

  return (
    <Card as="article">
      <Stack gap={2}>
        <Row justify="between" align="baseline">
          <Row gap={2} align="baseline">
            <Text as="span" variant="name">{post.author.username}</Text>
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
          {canEdit && !editing && (
            <Button variant="quiet" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </Row>
        {editing ? (
          // The stored HTML is the editor's input: no separate document format.
          <Composer
            key={post.edited_at ?? 0}
            initialHtml={post.body_html}
            disabled={disabled}
            onSubmit={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <HtmlContent html={post.body_html} />
        )}
      </Stack>
    </Card>
  )
}
