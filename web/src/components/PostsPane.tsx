import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useGroups, useMarkRead, useMarkers, usePostActions, usePosts } from '../data/hooks'
import { ROOT_ID } from '../data/keys'
import { feedStream, markerOf } from '../data/notifications'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStreamStatus } from '../hooks/StreamContext'
import { Alert, Button, Card, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'
import { postExtensions } from '../editor/extensions'
import { BodyEditor } from './BodyEditor'
import { PostList } from './PostList'

interface PostsPaneProps {
  /** The group whose feed this pane shows. */
  groupId: string
  /** Which outer edge is padded. `left` or `right` is used inside a Split. */
  side?: 'left' | 'right' | 'full'
  /** True while the pane is open and not behind another page. A visible pane marks its feed as read. */
  watching: boolean
  /**
   * Shown after the posts, at the end of the feed, or at the bottom of the pane when the feed is shorter than the pane.
   * Home's feed shows the release and the links to About and the source code.
   */
  foot?: ReactNode
}

/** The delay after the newest shown post before the feed is marked read. */
const READ_DEBOUNCE_MS = 800

export function PostsPane({ groupId, side = 'full', watching, foot }: PostsPaneProps) {
  const status = useStreamStatus()
  const { posts, loading, error, hasMore, loadMore } = usePosts(groupId)
  const { create, edit, remove } = usePostActions(groupId)
  const offline = status === 'offline'
  const { groups } = useGroups()
  // A visible feed is marked read. While the
  // pane is watched and the page is in the foreground, the user's read marker
  // on this feed moves to its newest post.
  const { markers, loaded } = useMarkers()
  const markRead = useMarkRead()
  const visible = usePageVisible()
  const newest = posts[0]?.created_at
  const readAt = markerOf(markers, feedStream(groupId))
  useEffect(() => {
    if (!watching || !visible || !loaded || newest === undefined) return
    if (newest > (readAt ?? 0)) markRead(feedStream(groupId), newest, READ_DEBOUNCE_MS)
  }, [watching, visible, loaded, newest, readAt, groupId, markRead])

  return (
    <Pane side={side} tour="posts">
      <ScrollArea foot={foot}>
        <Measure>
          <Stack gap={3}>
            <Card>
              <BodyEditor
                groupId={groupId}
                extensions={postExtensions}
                size="post"
                submitLabel="Post"
                disabled={offline}
                onSubmit={create}
                draft={`post:${groupId}`}
              />
            </Card>
            <Stack gap={3}>
              {loading && posts.length === 0 ? (
                <Text variant="secondary">Loading…</Text>
              ) : (
                <PostList
                  posts={posts}
                  disabled={offline}
                  onEdit={edit}
                  onDelete={remove}
                  places={groupId === ROOT_ID ? groups : undefined}
                />
              )}
              {error && <Alert tone="error">{error.message}</Alert>}
              {hasMore && (
                <Row>
                  <Button variant="secondary" busy={loading} onClick={loadMore}>
                    Load more
                  </Button>
                </Row>
              )}
            </Stack>
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
