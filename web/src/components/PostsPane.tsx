import { useEffect } from 'react'
import { useMarkRead, useMarkers, usePostActions, usePosts } from '../data/hooks'
import { feedStream, markerOf } from '../data/notifications'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStreamStatus } from '../hooks/StreamContext'
import { Button, Card, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'
import { postExtensions } from '../editor/extensions'
import { BodyEditor } from './BodyEditor'
import { ConnectionStatus } from './ConnectionStatus'
import { PostList } from './PostList'

interface PostsPaneProps {
  /** The group whose feed this is. */
  groupId: string
  /** Which outer edge is padded; `left`/`right` inside a Split. */
  side?: 'left' | 'right' | 'full'
  /** Being looked at: open, and not behind another page. Looking is reading. */
  watching: boolean
}

/** A feed marks itself read this long after the newest post it showed. */
const READ_DEBOUNCE_MS = 800

export function PostsPane({ groupId, side = 'full', watching }: PostsPaneProps) {
  const status = useStreamStatus()
  const { posts, loading, error, hasMore, loadMore } = usePosts(groupId)
  const { create, edit, remove } = usePostActions(groupId)
  const offline = status === 'offline'

  // Looking is reading (architecture.md, Notifications): while watched and
  // the page is in front, my marker on this feed follows its newest post.
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
    <Pane side={side}>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            <Card>
              <Stack gap={1}>
                <ConnectionStatus status={status} />
                <BodyEditor
                  extensions={postExtensions}
                  size="post"
                  submitLabel="Post"
                  busyLabel="Posting…"
                  disabled={offline}
                  onSubmit={create}
                />
              </Stack>
            </Card>
            <Stack gap={3}>
              {loading && posts.length === 0 ? (
                <Text variant="secondary">Loading…</Text>
              ) : (
                <PostList posts={posts} disabled={offline} onEdit={edit} onDelete={remove} />
              )}
              {error && <Text variant="secondary">{error.message}</Text>}
              {hasMore && (
                <Row>
                  <Button variant="secondary" disabled={loading} onClick={loadMore}>
                    {loading ? 'Loading…' : 'Load more'}
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
