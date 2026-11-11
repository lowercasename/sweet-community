import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useGroups, useMarkRead, useMarkers, usePostActions, usePosts, useTopicActions, useTopics } from '../data/hooks'
import { ROOT_ID } from '../data/keys'
import { feedStream, markerOf } from '../data/notifications'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStreamStatus } from '../hooks/StreamContext'
import { COMMUNITY, topicPath } from '../routes'
import {
  Alert,
  Button,
  Card,
  Measure,
  Pane,
  Pill,
  PillCaption,
  Row,
  ScrollArea,
  ShieldMark,
  shieldText,
  Stack,
  Text,
} from '../ui'
import { postExtensions } from '../editor/extensions'
import { BodyEditor } from './BodyEditor'
import { PostList } from './PostList'
import { TopicMenu } from './TopicMenu'

interface PostsPaneProps {
  /** The group whose feed this pane shows. */
  groupId: string
  /** Which outer edge is padded. `left` or `right` is used inside a Split. */
  side?: 'left' | 'right' | 'full'
  /** True while the pane is open and not behind another page. A visible pane marks its feed as read. */
  watching: boolean
  /** The topic that the community's feed is filtered to, read from the URL. */
  topicId?: string | null
  /**
   * Shown after the posts, at the end of the feed, or at the bottom of the pane when the feed is shorter than the pane.
   * Home's feed shows the release and the links to About and the source code.
   */
  foot?: ReactNode
}

/** The delay after the newest shown post before the feed is marked read. */
const READ_DEBOUNCE_MS = 800

export function PostsPane({ groupId, side = 'full', watching, topicId = null, foot }: PostsPaneProps) {
  const status = useStreamStatus()
  const { posts, loading, error, hasMore, loadMore } = usePosts(groupId, topicId)
  const { create, edit, remove, setTopic } = usePostActions(groupId)
  const offline = status === 'offline'
  // Only the community's feed has topics. A new post gets the topic the feed is filtered to.
  const { topics } = useTopics()
  const topical = groupId === ROOT_ID && topics.length > 0
  // The owner and moderators manage topics. With none yet, the feed offers them Add topics, so the setting is found
  // where topics are used. Members see nothing until a topic exists.
  const { groups } = useGroups()
  const staff = groupId === ROOT_ID && groups.find((g) => g.id === ROOT_ID)?.can.manage_topics === true
  const topic = topical ? topics.find((t) => t.id === topicId) : undefined
  const topicActions = useTopicActions()
  const [, navigate] = useLocation()
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
    // The post gets the topic the feed is currently filtered to, or no topic.
    await create(html, topical ? (topic?.id ?? null) : null)
  }

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
            <Card
              head={
                !topical && staff ? (
                  <Stack gap={2}>
                    <Row align="center">
                      <Pill href={COMMUNITY} tone="quiet" size="md">
                        Add topics
                      </Pill>
                      <ShieldMark label={shieldText.staffSee} />
                    </Row>
                    <PillCaption>
                      Topics sort posts by subject, like Introductions or Questions. Until you add some, members won't
                      see this section.
                    </PillCaption>
                  </Stack>
                ) : (
                  topical && (
                    <Stack gap={2}>
                      <Row justify="between" align="center" wrap="never">
                        <TopicMenu
                          topics={topics}
                          value={topic?.id ?? null}
                          onChange={(id) => navigate(id ? topicPath(id) : '/')}
                          noneLabel="Everything"
                          label="Showing"
                          tour="topics"
                          onEdit={staff ? () => navigate(COMMUNITY) : undefined}
                        />
                        {topic && (
                          <Button
                            variant="ghost"
                            icon={topic.following ? (overBell ? 'bell-off' : 'bell-ring') : 'bell'}
                            pressed={topic.following}
                            disabled={following || offline}
                            onClick={() => void follow()}
                            onHoverChange={setOverBell}

                            labels={['Subscribe', 'Subscribed', 'Unsubscribe']}
                          >
                            {topic.following ? (overBell ? 'Unsubscribe' : 'Subscribed') : 'Subscribe'}
                          </Button>
                        )}
                      </Row>
                      {topic?.description && <PillCaption>{topic.description}</PillCaption>}
                    </Stack>
                  )
                )
              }
            >
              <BodyEditor
                groupId={groupId}
                extensions={postExtensions}
                size="post"
                placeholder={topic ? `Say something in ${topic.name}…` : undefined}
                submitLabel="Post"
                disabled={offline}
                onSubmit={post}
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
                  onSetTopic={topical ? setTopic : undefined}
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
