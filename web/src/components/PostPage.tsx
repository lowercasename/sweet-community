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
 * A post at its own address, `/p/<id>` (architecture.md, Posts): the post
 * with its thread open. The bar above (Home's) says whose it is and leads
 * back to the room it is in. Notifications land here. A post that is gone, or in a
 * room I am not in, is the same to me: not here.
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
                <Text variant="secondary">This post is gone, or it is in a room you are not in.</Text>
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
  return (
    <>
      <Pane>
        <ScrollArea>
          <Measure>
            <Post
              post={post}
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
