import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useMe, useGroups, useMarkRead, useMarkers, usePostActions, usePosts } from '../data/hooks'
import { postDestinations } from '../data/groups'
import { ROOT_ID } from '../data/keys'
import { feedStream, markerOf } from '../data/notifications'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStreamStatus } from '../hooks/StreamContext'
import { Alert, Button, Card, DestinationPicker, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'
import { postExtensions } from '../editor/extensions'
import { loadDraftDestination, saveDraftDestination } from '../editor/drafts'
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
  const { data: me } = useMe()
  const draft = `post:${groupId}`
  const [destination, setDestination] = useState(() =>
    groupId === ROOT_ID && me ? (loadDraftDestination(me.id, draft) ?? groupId) : groupId,
  )
  const [posting, setPosting] = useState(false)
  const { edit, remove } = usePostActions(groupId)
  const { create } = usePostActions(destination)
  const offline = status === 'offline'
  const { groups } = useGroups()
  const choices = postDestinations(groups)
  const valid = groupId !== ROOT_ID || choices.some((g) => g.id === destination)
  const choose = (id: string) => {
    setDestination(id)
    if (me) saveDraftDestination(me.id, draft, id)
  }
  const submit = async (html: string) => {
    if (!valid) throw new Error('Choose a room before posting')
    setPosting(true)
    try {
      await create(html)
      setDestination(groupId)
    } finally {
      setPosting(false)
    }
  }
  // A visible feed is marked read. While the
  // pane is watched and the page is in the foreground, the user's read marker
  // on this feed moves to its newest post.
  const { markers, loaded } = useMarkers()
  const markRead = useMarkRead()
  const visible = usePageVisible()
  const newest = posts.length ? Math.max(...posts.map((post) => post.created_at)) : undefined
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
                groupId === ROOT_ID ? (
                  <DestinationPicker
                    value={destination}
                    choices={choices}
                    disabled={offline || posting || choices.length === 0}
                    onChange={choose}
                  />
                ) : undefined
              }
            >
              {!valid && choices.length > 0 && (
                <Alert tone="error">That room is no longer available. Choose another room to post.</Alert>
              )}
              <BodyEditor
                groupId={destination}
                extensions={postExtensions}
                size="post"
                submitLabel="Post"
                disabled={offline || !valid}
                onSubmit={submit}
                draft={draft}
                draftDestination={{ value: destination, initial: groupId, onChange: setDestination }}
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
