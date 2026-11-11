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
  shieldText,
  Stack,
  Text,
  Tile,
  Time,
} from '../ui'
import { Body } from './Body'
import { BodyEditor } from './BodyEditor'
import { CommentThread } from './CommentThread'
import { PersonName } from './PersonName'
import { ReportDialog } from './ReportDialog'

interface PostProps {
  post: PostData
  /** Whether the time links to the post's own page. False on that page. */
  linked?: boolean
  /** Start with the comment thread open, as on the post's page. */
  expanded?: boolean
  /**
   * The group the post was made in, for lists that mix groups, such as a
   * profile page or the post's page. It is shown as a header, as in old Sweet.
   */
  place?: { id: string; name: string; picture?: string | null }
  /** True while offline. Disables saving. */
  disabled: boolean
  /** Resolves when the server has stored the new body. */
  onEdit: (bodyHtml: string) => Promise<void>
  /** Resolves when the server has deleted the post. The post is then removed from the query cache. */
  onDelete: () => Promise<void>
  /** Sets the post's topic, or clears it. Called from the editor when the author saves. */
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
  // The topic name is read from the topics cache, so a rename updates every pill at once.
  const { topics } = useTopics()
  const topic = topics.find((t) => t.id === post.topic_id)
  const [draftTopic, setDraftTopic] = useState<string | null>(post.topic_id)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(expanded)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const save = async (bodyHtml: string) => {
    await onEdit(bodyHtml)
    if (draftTopic !== post.topic_id && onSetTopic) await onSetTopic(draftTopic)
    setEditing(false)
  }
  const startEditing = () => {
    setDraftTopic(post.topic_id)
    setEditing(true)
  }

  // The topic pill comes after the time in the author line, which shows who, when and
  // where. For every user, the pill links to the topic. The card's right edge holds the menu, which is hidden until
  // hovered. The topic is changed while editing the post.
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

  // The server decides what this user can do and sends it as the post's can flags.
  const items: MenuItem[] = []
  if (post.can.edit) items.push({ label: 'Edit', icon: 'pencil', onSelect: startEditing })
  if (post.can.report) items.push({ label: 'Report', icon: 'flag', onSelect: () => setReporting(true) })
  if (post.can.delete)
    items.push({
      label: 'Delete',
      icon: 'trash',
      danger: true,
      shield: post.can.delete_by_role ? shieldText.rolesDo : undefined,
      onSelect: () => setConfirming(true),
    })

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
            // The stored HTML is passed to the editor as its input. There is no separate document format.
            <BodyEditor
              groupId={post.group_id}
              key={post.edited_at ?? 0}
              extensions={postExtensions}
              size="post"
              submitLabel="Save"
              initialHtml={post.body_html}
              draft={`post-edit:${post.id}`}
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
        confirmLabel="Delete"
        icon="trash"
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirming(false)}
      >
        <Text variant="secondary">
          This will also delete all the comments made on this post. This action cannot be undone.
        </Text>
      </ConfirmDialog>
      <ReportDialog
        kind="post"
        id={post.id}
        author={author.username}
        open={reporting}
        onClose={() => setReporting(false)}
      />
    </Card>
  )
}
