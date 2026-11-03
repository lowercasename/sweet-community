import { useEffect, useState } from 'react'
import { createPost, getPosts, updatePost, type Post, type User } from '../api'
import { useStreamEvents, useStreamStatus } from '../hooks/StreamContext'
import { Button, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'
import { Composer } from './Composer'
import { ConnectionStatus } from './ConnectionStatus'
import { PaneTitle } from './PaneTitle'
import { PostList } from './PostList'

interface PostsPaneProps {
  me: User | null
  onClose?: () => void
}

function isPost(data: unknown): data is Post {
  return typeof data === 'object' && data !== null && typeof (data as Post).id === 'string'
}

/** Newest first; drops anything already present (by id). */
function prepend(posts: Post[], incoming: Post): Post[] {
  if (posts.some((p) => p.id === incoming.id)) return posts
  return [incoming, ...posts]
}

/** Replaces the post with the same id in place; ignores posts not loaded. */
function replace(posts: Post[], incoming: Post): Post[] {
  return posts.map((p) => (p.id === incoming.id ? incoming : p))
}

export function PostsPane({ me, onClose }: PostsPaneProps) {
  const status = useStreamStatus()
  const [posts, setPosts] = useState<Post[]>([])
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useStreamEvents((kind, data) => {
    if (!isPost(data)) return
    if (kind === 'post') setPosts((prev) => prepend(prev, data))
    if (kind === 'post_edit') setPosts((prev) => replace(prev, data))
  })

  useEffect(() => {
    let cancelled = false
    getPosts()
      .then((page) => {
        if (cancelled) return
        setPosts((prev) => {
          // Events may have arrived before the first page: merge, keep newest first.
          const seen = new Set(page.posts.map((p) => p.id))
          const live = prev.filter((p) => !seen.has(p.id))
          return [...live, ...page.posts].sort((a, b) => b.created_at - a.created_at)
        })
        setNextBefore(page.next_before)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadMore = async () => {
    if (nextBefore == null || loading) return
    setLoading(true)
    setLoadError(null)
    try {
      const page = await getPosts(nextBefore)
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...page.posts.filter((p) => !seen.has(p.id))]
      })
      setNextBefore(page.next_before)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load')
    } finally {
      setLoading(false)
    }
  }

  const submit = async (bodyHtml: string) => {
    const post = await createPost(bodyHtml)
    setPosts((prev) => prepend(prev, post))
  }

  const edit = async (id: string, bodyHtml: string) => {
    const post = await updatePost(id, bodyHtml)
    setPosts((prev) => replace(prev, post))
  }

  return (
    <Pane>
      <PaneTitle title="Posts" onClose={onClose} />
      <ScrollArea>
        <Measure>
          <Stack gap={4}>
            <Stack gap={1}>
              <ConnectionStatus status={status} />
              <Composer disabled={status === 'offline'} onSubmit={submit} />
            </Stack>
            <Stack gap={3}>
              {loading && posts.length === 0 ? (
                <Text variant="secondary">Loading…</Text>
              ) : (
                <PostList posts={posts} me={me} disabled={status === 'offline'} onEdit={edit} />
              )}
              {loadError && <Text variant="secondary">{loadError}</Text>}
              {nextBefore != null && (
                <Row>
                  <Button variant="quiet" disabled={loading} onClick={() => void loadMore()}>
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
