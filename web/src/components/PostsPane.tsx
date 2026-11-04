import { usePostActions, usePosts } from '../data/hooks'
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
}

export function PostsPane({ groupId, side = 'full' }: PostsPaneProps) {
  const status = useStreamStatus()
  const { posts, loading, error, hasMore, loadMore } = usePosts(groupId)
  const { create, edit, remove } = usePostActions(groupId)
  const offline = status === 'offline'

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
