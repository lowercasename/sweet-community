import type { Group, Post as PostData } from '../api'
import { usePost, usePostActions } from '../data/hooks'
import { useStreamStatus } from '../hooks/StreamContext'
import { groupPath } from '../routes'
import { Button, Card, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'
import { Post } from './Post'

interface PostPageProps {
  postId: string
  groups: Group[]
  onGo: (path: string) => void
}

/**
 * The page for a single post at `/p/<id>` (architecture.md, Posts). It shows
 * the post with its comment thread open. The bar above it is rendered by
 * Home. The bar shows the post's author and links back to the post's group.
 * Notifications link to this page. A deleted post and a post in a group the
 * user is not in are both shown as not found.
 */
export function PostPage({ postId, groups, onGo }: PostPageProps) {
  const { post, loading, error } = usePost(postId)
  if (post) return <Loaded post={post} groups={groups} onGo={onGo} />
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            {loading && !error ? (
              <Text variant="secondary">Loading…</Text>
            ) : (
              <Stack gap={2}>
                <Text variant="secondary">This post has been deleted, or it is in a room you are not a member of.</Text>
                <Row>
                  <Button variant="secondary" icon="home" onClick={() => onGo('/')}>
                    Home
                  </Button>
                </Row>
              </Stack>
            )}
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}

function Loaded({ post, groups, onGo }: { post: PostData; groups: Group[]; onGo: (path: string) => void }) {
  const status = useStreamStatus()
  const actions = usePostActions(post.group_id)
  const root = groups.find((g) => g.kind === 'root')
  const back = groupPath(post.group_id, root?.id)
  const room = groups.find((g) => g.id === post.group_id)
  const place = room && room.kind !== 'root' ? { id: room.id, name: room.name, picture: room.picture } : undefined
  return (
    <>
      <Pane>
        <ScrollArea>
          <Measure>
            <Post
              post={post}
              place={place}
              linked={false}
              expanded
              disabled={status === 'offline'}
              onEdit={(html) => actions.edit(post.id, html)}
              onDelete={async () => {
                await actions.remove(post.id)
                onGo(back)
              }}
            />
          </Measure>
        </ScrollArea>
      </Pane>
    </>
  )
}
