import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useMarkRead, useMarkers, usePostActions, usePosts, useTopicActions, useTopics } from '../data/hooks'
import { ROOT_ID } from '../data/keys'
import { feedStream, markerOf } from '../data/notifications'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStreamStatus } from '../hooks/StreamContext'
import { topicPath } from '../routes'
import { Alert, Button, Card, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'
import { postExtensions } from '../editor/extensions'
import { BodyEditor } from './BodyEditor'
import { ConnectionStatus } from './ConnectionStatus'
import { PostList } from './PostList'
import { TopicMenu } from './TopicMenu'

interface PostsPaneProps {
  /** The group whose feed this is. */
  groupId: string
  /** Which outer edge is padded; `left`/`right` inside a Split. */
  side?: 'left' | 'right' | 'full'
  /** Being looked at: open, and not behind another page. Looking is reading. */
  watching: boolean
  /** The community's feed showing one topic (architecture.md, Topics), from the URL. */
  topicId?: string | null
}

/** A feed marks itself read this long after the newest post it showed. */
const READ_DEBOUNCE_MS = 800

export function PostsPane({ groupId, side = 'full', watching, topicId = null }: PostsPaneProps) {
  const status = useStreamStatus()
  const { posts, loading, error, hasMore, loadMore } = usePosts(groupId, topicId)
  const { create, edit, remove, setTopic } = usePostActions(groupId)
  const offline = status === 'offline'
  // Topics are the community's feed's alone. The composer starts with the topic showing.
  const { topics } = useTopics()
  const topical = groupId === ROOT_ID && topics.length > 0
  const topic = topical ? topics.find((t) => t.id === topicId) : undefined
  const topicActions = useTopicActions()
  const [, navigate] = useLocation()
  const [draftTopic, setDraftTopic] = useState<string | null>(topicId)
  useEffect(() => setDraftTopic(topicId), [topicId])
  const [following, setFollowing] = useState(false)
  const [overBell, setOverBell] = useState(false)
  const follow = async () => {
    if (!topic) return
    setFollowing(true)
    try {
      await topicActions.follow(topic.id, !topic.following)
    } finally {
      setFollowing(false)
    }
  }
  const post = async (html: string) => {
    await create(html, topical ? draftTopic : null)
    setDraftTopic(topicId)
  }

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
            <Card
              head={
                topical && (
                  <Stack gap={1}>
                    <Row justify="between" align="center" wrap="never">
                      <TopicMenu
                        topics={topics}
                        value={topic?.id ?? null}
                        onChange={(id) => navigate(id ? topicPath(id) : '/')}
                        noneLabel="Everything"
                        label="Showing"
                      />
                      {topic && (
                        <Button
                          variant="ghost"
                          icon={topic.following ? (overBell ? 'bell-off' : 'bell-ring') : 'bell'}
                          pressed={topic.following}
                          disabled={following || offline}
                          onClick={() => void follow()}
                          onHoverChange={setOverBell}
                        >
                          {topic.following ? (overBell ? 'Unsubscribe' : 'Subscribed') : 'Subscribe'}
                        </Button>
                      )}
                    </Row>
                    {topic?.description && <Text variant="small">{topic.description}</Text>}
                  </Stack>
                )
              }
            >
              <Stack gap={1}>
                <ConnectionStatus status={status} />
                <BodyEditor
                  extensions={postExtensions}
                  size="post"
                  placeholder={topic ? `Say something in ${topic.name}…` : undefined}
                  submitLabel="Post"
                  busyLabel="Posting…"
                  disabled={offline}
                  onSubmit={post}
                  topic={topical && !topic ? { topics, value: draftTopic, onChange: setDraftTopic } : undefined}
                />
              </Stack>
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
                  onSetTopic={topical ? setTopic : undefined}
                />
              )}
              {error && <Alert tone="error">{error.message}</Alert>}
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
