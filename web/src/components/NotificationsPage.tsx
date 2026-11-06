import { useEffect, useRef, useState } from 'react'
import type { Group, Notification } from '../api'
import { useAuthor, useClearNotifications, useMarkRead, useMarkers, useNotifications } from '../data/hooks'
import { NOTIFICATIONS, describe, markerOf, targetOf, unreadOf } from '../data/notifications'
import {
  Avatar,
  Button,
  Card,
  Heading,
  List,
  ListItem,
  ListRow,
  Measure,
  Pane,
  Row,
  ScrollArea,
  Stack,
  Text,
  Time,
} from '../ui'

interface NotificationsPageProps {
  groups: Group[]
  onGo: (path: string) => void
}

/**
 * What was done to me (architecture.md, Notifications): newest first, each
 * a sentence that opens the thing, in two sections. New is what is newer
 * than my marker as it stood when I arrived; looking moves the marker to
 * the newest, here and on every other device, so the bell's dot goes, but
 * the section holds while I look. Earlier is what I had already seen, and
 * can be cleared for good.
 */
export function NotificationsPage({ groups, onGo }: NotificationsPageProps) {
  const { notifications, loading, error, hasMore, loadMore } = useNotifications()
  const { markers, loaded } = useMarkers()
  const markRead = useMarkRead()
  const clear = useClearNotifications()
  const [clearing, setClearing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const readAt = markerOf(markers, NOTIFICATIONS)
  const root = groups.find((g) => g.kind === 'root')

  // Where I had read to when I arrived is what counts as new on this visit;
  // taken once, in the same effect that moves the marker, so it is the marker
  // as it was before looking moved it. Looking is reading: the marker follows
  // the newest one here, now and as more land while I look.
  const arrived = useRef<number | undefined>(undefined)
  const [arrivedAt, setArrivedAt] = useState<number | undefined>()
  const newest = notifications[0]?.created_at
  useEffect(() => {
    if (!loaded) return
    if (arrived.current === undefined) {
      arrived.current = readAt ?? 0
      setArrivedAt(arrived.current)
    }
    if (newest !== undefined && newest > (readAt ?? 0)) void markRead(NOTIFICATIONS, newest)
  }, [loaded, readAt, newest, markRead])

  const fresh = new Set(unreadOf(notifications, arrivedAt).map((n) => n.id))
  const recent = notifications.filter((n) => fresh.has(n.id))
  const earlier = notifications.filter((n) => !fresh.has(n.id))
  const clearSeen = async () => {
    if (arrivedAt === undefined) return
    setClearing(true)
    setProblem(null)
    try {
      await clear(arrivedAt)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not clear them')
    } finally {
      setClearing(false)
    }
  }
  const rows = (list: Notification[]) => (
    <List gap={1}>
      {list.map((n) => (
        <NotificationRow
          key={n.id}
          notification={n}
          fresh={fresh.has(n.id)}
          groups={groups}
          onOpen={() => onGo(targetOf(n, root?.id))}
        />
      ))}
    </List>
  )
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            <Stack gap={2}>
              {error && <Text variant="secondary">{error.message}</Text>}
              {!loading && notifications.length === 0 && <Text variant="secondary">Nice and quiet in here.</Text>}
              {recent.length > 0 && (
                <Stack gap={1}>
                  <Heading level={3}>New</Heading>
                  {rows(recent)}
                </Stack>
              )}
              {earlier.length > 0 && (
                <Stack gap={1}>
                  <Row justify="between" align="center">
                    <Heading level={3}>Earlier</Heading>
                    <Button variant="ghost" icon="trash" disabled={clearing} onClick={() => void clearSeen()}>
                      {clearing ? 'Clearing…' : 'Clear'}
                    </Button>
                  </Row>
                  {problem && <Text variant="secondary">{problem}</Text>}
                  {rows(earlier)}
                </Stack>
              )}
              {hasMore && (
                <Row>
                  <Button variant="secondary" disabled={loading} onClick={loadMore}>
                    {loading ? 'Loading…' : 'Load more'}
                  </Button>
                </Row>
              )}
            </Stack>
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}

interface NotificationRowProps {
  notification: Notification
  /** Newer than my marker when I arrived. */
  fresh: boolean
  groups: Group[]
  onOpen: () => void
}

/** One line: who, what, when. The row is the control, so the name is text, not a card. */
function NotificationRow({ notification: n, fresh, groups, onOpen }: NotificationRowProps) {
  const actor = useAuthor(n.actor)
  const sentence = `${actor.username} ${describe(n, groups)}`
  return (
    <ListItem>
      <ListRow label={fresh ? `${sentence}, new` : sentence} onClick={onOpen}>
        <Avatar name={actor.username} picture={actor.picture} size="sm" />
        <Text as="span" variant="body" weight={fresh ? 'bold' : 'normal'}>
          {sentence}
        </Text>
        <Text as="span" variant="small">
          <Time at={n.created_at} />
        </Text>
      </ListRow>
    </ListItem>
  )
}
