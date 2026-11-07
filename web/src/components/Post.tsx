import { useState } from 'react'
import type { Post as PostData } from '../api'
import { useAuthor, useTopics } from '../data/hooks'
import { ROOT_ID } from '../data/keys'
import { postExtensions } from '../editor/extensions'
import { groupPath, postPath, topicPath } from '../routes'
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Link,
  Menu,
  type MenuItem,
  Pill,
  Row,
  Stack,
  Text,
  Tile,
  Time,
} from '../ui'
import { Body } from './Body'
import { BodyEditor } from './BodyEditor'
import { CommentThread } from './CommentThread'
import { PersonName } from './PersonName'

interface PostProps {
  post: PostData
  /** The time links to the post's own page; false on that page. */
  linked?: boolean
  /** Start with the thread open (the post's page). */
  expanded?: boolean
  /** The room it was said in, when the list mixes rooms (a person's page, the post's page): drawn as a header, as old Sweet drew it. */
  place?: { id: string; name: string; picture?: string | null }
  /** True while offline; disables saving. */
  disabled: boolean
  /** Resolves when the server has stored the new body. */
  onEdit: (bodyHtml: string) => Promise<void>
  /** Resolves when the server has deleted the post; the cache drops it. */
  onDelete: () => Promise<void>
  /** Files the post under a topic, or none (architecture.md, Topics), from the editor when the author saves. */
  onSetTopic?: (topicId: string | null) => Promise<void>
}

export function Post({
  post,
  linked = true,
  expanded = false,
  place,
  disabled,
  onEdit,
  onDelete,
  onSetTopic,
}: PostProps) {
  const author = useAuthor(post.author)
  // The topic is named from the topics cache, so a rename reaches every pill at once.
  const { topics } = useTopics()
  const topic = topics.find((t) => t.id === post.topic_id)
  const [draftTopic, setDraftTopic] = useState<string | null>(post.topic_id)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(expanded)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const save = async (bodyHtml: string) => {
    await onEdit(bodyHtml)
    if (draftTopic !== post.topic_id && onSetTopic) await onSetTopic(draftTopic)
    setEditing(false)
  }
  const startEditing = () => {
    setDraftTopic(post.topic_id)
    setEditing(true)
  }

  // The pill (architecture.md, Topics) follows the time in the author line, who, when, where, and opens the topic,
  // for everyone. The card's right edge is the menu's, which is out of sight until hovered. The topic is changed
  // while editing the post.
  const pill = topic ? (
    <Pill href={topicPath(topic.id)} label={`Topic: ${topic.name}`}>
      {topic.name}
    </Pill>
  ) : null

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
  if (post.can.edit) items.push({ label: 'Edit', icon: 'pencil', onSelect: startEditing })
  if (post.can.delete) items.push({ label: 'Delete', icon: 'trash', onSelect: () => setConfirming(true) })

  const when = (
    <>
      <Time at={post.created_at} />
      {post.edited_at != null && (
        <>
          <Text as="span" variant="small">
            {' · edited '}
          </Text>
          <Time at={post.edited_at} />
        </>
      )}
    </>
  )

  return (
    <Card
      as="article"
      head={
        place && (
          <Row gap={2} align="center">
            <Tile name={place.name} picture={place.picture} />
            <Text as="span" variant="small">
              Posted in{' '}
              <Link href={groupPath(place.id)}>
                <Text as="span" variant="body" weight="bold">
                  {place.name}
                </Text>
              </Link>
            </Text>
          </Row>
        )
      }
    >
      <Stack gap={3}>
        <Stack gap={2}>
          <Row justify="between" align="start" wrap="never">
            <Row gap={2} align="center">
              <PersonName user={author} avatar="md" />
              <Text as="span" variant="small">
                {linked ? <Link href={postPath(post.id)}>{when}</Link> : when}
              </Text>
              {!editing && pill}
            </Row>
            {items.length > 0 && !editing && !disabled && <Menu label="Post options" items={items} reveal="post" />}
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
              topic={
                post.group_id === ROOT_ID && onSetTopic
                  ? { topics, value: draftTopic, onChange: setDraftTopic }
                  : undefined
              }
            />
          ) : (
            <Body html={post.body_html} />
          )}
          {deleteError && <Alert tone="error">{deleteError}</Alert>}
        </Stack>
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
        {open && (
          <CommentThread postId={post.id} groupId={post.group_id} replyTo={author.username} disabled={disabled} />
        )}
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
