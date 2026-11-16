import { useState } from 'react'
import type { Post as PostData } from '../api'
import { useAuthor, useMarkers, usePostNotificationPreference } from '../data/hooks'
import { hasUnread, postStream } from '../data/notifications'
import { postExtensions } from '../editor/extensions'
import { groupPath, postPath } from '../routes'
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Link,
  PrivateMark,
  Menu,
  type MenuItem,
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
import { AddReaction, Reactions, useToggleReaction } from './Reactions'
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
}

export function Post({ post, linked = true, expanded = false, place, disabled, onEdit, onDelete }: PostProps) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const preference = usePostNotificationPreference(post.id, optionsOpen)
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [savingPreference, setSavingPreference] = useState(false)
  const follow = async (following: boolean) => {
    setSavingPreference(true)
    setNotificationError(null)
    try {
      await preference.set(following)
    } catch (e) {
      setNotificationError(e instanceof Error ? e.message : 'Could not save your choice')
    } finally {
      setSavingPreference(false)
    }
  }
  const author = useAuthor(post.author)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(expanded)
  // Other users' comments the user has not read. The dot shows on the comments button while the comments are closed.
  const unread = hasUnread(useMarkers().markers, postStream(post.id))
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [reactionError, setReactionError] = useState<string | null>(null)
  const toggleReaction = useToggleReaction()
  const react = async (emoji: string) => setReactionError(await toggleReaction('post', post.id, post.reactions, emoji))
  const [reporting, setReporting] = useState(false)

  const save = async (bodyHtml: string) => {
    await onEdit(bodyHtml)
    setEditing(false)
  }
  const startEditing = () => {
    setEditing(true)
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

  // The server decides what this user can do and sends it as the post's can flags.
  const items: MenuItem[] = preference.data
    ? [
        {
          label: preference.data.following ? 'Mute discussion' : 'Follow discussion',
          icon: preference.data.following ? 'bell-off' : 'bell',
          onSelect: () => void follow(!preference.data!.following),
        },
      ]
    : [
        {
          label: preference.error ? 'Could not load discussion settings' : 'Loading discussion settings…',
          disabled: true,
          onSelect: () => {},
        },
      ]
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
      <Time at={post.created_at} format="date" />
      {post.edited_at != null && (
        <Text as="span" variant="small">
          {' · edited'}
        </Text>
      )}
    </>
  )

  return (
    <Card
      as="article"
      head={
        place && (
          <Row gap={2} align="center" wrap="never">
            <Tile name={place.name} picture={place.picture} />
            <Text as="span" variant="small">
              Posted in{' '}
              <Link href={groupPath(place.id)}>
                <Text as="span" variant="body" weight="bold">
                  {place.name}
                </Text>
              </Link>
              {post.group_visibility === 'private' && (
                <>
                  {'\u00a0'}
                  <PrivateMark />
                </>
              )}
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
            </Row>
            {items.length > 0 && !editing && !disabled && (
              <Menu
                label="Post options"
                items={items}
                reveal
                disabled={savingPreference}
                onOpenChange={setOptionsOpen}
              />
            )}
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
            />
          ) : (
            <Body html={post.body_html} />
          )}
          {notificationError && <Alert tone="error">{notificationError}</Alert>}
          {deleteError && <Alert tone="error">{deleteError}</Alert>}
        </Stack>
        <Row gap={1} align="center">
          <Button
            variant="ghost"
            icon="comment"
            count={post.comment_count}
            label={open ? 'Hide comments' : 'Show comments'}
            dot={!open && unread}
            pressed={open}
            onClick={() => setOpen((o) => !o)}
          />
          <Reactions reactions={post.reactions} disabled={disabled} onToggle={(emoji) => void react(emoji)} />
          <AddReaction disabled={disabled} onPick={(emoji) => void react(emoji)} />
        </Row>
        {reactionError && <Alert tone="error">{reactionError}</Alert>}
        {open && (
          <CommentThread
            postAt={post.created_at}
            postId={post.id}
            groupId={post.group_id}
            replyTo={author.username}
            disabled={disabled}
          />
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
