import { useRef, useState } from 'react'
import type { Comment as CommentData } from '../api'
import { useAuthor, useCommentActions, useComments } from '../data/hooks'
import { commentExtensions } from '../editor/extensions'
import {
  Alert,
  ReadPoint,
  Box,
  Button,
  Card,
  ConfirmDialog,
  Hairline,
  ItemBlock,
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
import { useReadProgress } from '../hooks/useReadProgress'
import { PersonName } from './PersonName'
import { AddReaction, Reactions, useToggleReaction } from './Reactions'
import { ReportDialog } from './ReportDialog'

interface CommentThreadProps {
  postId: string
  groupId: string
  /** The post's author, shown as the user a reply is addressed to. */
  replyTo: string
  disabled: boolean
  postAt: number
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
  // True while the action bar's menu or picker is open, which keeps the bar shown.
  const [opened, setOpened] = useState(false)
  const toggleReaction = useToggleReaction()
  const react = async (emoji: string) => setError(await toggleReaction('comment', comment.id, comment.reactions, emoji))

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
      <ItemBlock
        actionsOpen={opened && !editing && !disabled}
        actions={
          !editing && !disabled ? (
            <>
              <AddReaction compact onPick={(emoji) => void react(emoji)} onOpenChange={setOpened} />
              {items.length > 0 && <Menu label="Comment options" compact items={items} onOpenChange={setOpened} />}
            </>
          ) : undefined
        }
      >
        <Stack gap={1}>
          <Row gap={2} align="center">
            <PersonName user={author} avatar="xs" small />
            <Text as="span" variant="small">
              <Time at={comment.created_at} />
              {comment.edited_at != null && ' · edited'}
            </Text>
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
          {!editing && (
            <Reactions reactions={comment.reactions} disabled={disabled} onToggle={(emoji) => void react(emoji)} />
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </Stack>
      </ItemBlock>
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
 * The reply editor is the only white element in the panel. A long thread
 * opens at its newest comments, with Load earlier comments above them.
 */
export function CommentThread({ postId, groupId, replyTo, disabled, postAt }: CommentThreadProps) {
  const { comments, loading, error, hasEarlier, loadEarlier } = useComments(postId)
  const { create, edit, remove } = useCommentActions(postId, groupId)
  const ref = useRef<HTMLDivElement>(null)
  useReadProgress(ref, `post:${postId}`, !loading, `${comments.length}:${comments.at(-1)?.created_at}`)

  return (
    <Box ref={ref}>
      <Card tone="field">
        {/* The read points are outside the stacks, so they add no gap. */}
        <ReadPoint at={postAt} />
        <Stack gap={3}>
          {(loading || error || comments.length > 0) && (
            <Stack gap={2}>
              {hasEarlier && (
                <Row>
                  <Button variant="secondary" busy={loading} onClick={() => void loadEarlier()}>
                    Load earlier comments
                  </Button>
                </Row>
              )}
              {loading && comments.length === 0 && <Text variant="secondary">Loading comments…</Text>}
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
                  <ReadPoint at={c.created_at} />
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
    </Box>
  )
}
