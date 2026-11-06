import { useEffect, useRef, useState } from 'react'
import type { Group, Notification } from '../api'
import { useAuthor, useMarkRead, useMarkers, useNotifications } from '../data/hooks'
import { NOTIFICATIONS, describe, markerOf, targetOf, unreadOf } from '../data/notifications'
import { Avatar, Button, Card, List, ListItem, ListRow, Measure, Pane, Row, ScrollArea, Stack, Text, Time } from '../ui'

interface NotificationsPageProps {
  groups: Group[]
  onGo: (path: string) => void
}

/**
 * What was done to me (architecture.md, Notifications): newest first, each
 * a sentence that opens the thing. The ones newer than my marker when I
 * arrived stay marked new while I look; looking moves the marker to the
 * newest, here and on every other device, so the bell's dot goes.
 */
export function NotificationsPage({ groups, onGo }: NotificationsPageProps) {
  const { notifications, loading, error, hasMore, loadMore } = useNotifications()
  const { markers, loaded } = useMarkers()
  const markRead = useMarkRead()
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
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            <Stack gap={2}>
              {error && <Text variant="secondary">{error.message}</Text>}
              {!loading && notifications.length === 0 && (
                <Text variant="secondary">
                  Nothing yet. When someone comments on your post or adds you to a room, it shows here.
                </Text>
              )}
              {notifications.length > 0 && (
                <List gap={1}>
                  {notifications.map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      fresh={fresh.has(n.id)}
                      groups={groups}
                      onOpen={() => onGo(targetOf(n, root?.id))}
                    />
                  ))}
                </List>
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
