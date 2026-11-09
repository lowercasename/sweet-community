import { useState } from 'react'
import type { Group, Notification } from '../api'
import { useAuthor, useClearNotifications, useNotifications, useReadNotification, useTopics } from '../data/hooks'
import { describe, targetOf } from '../data/notifications'
import {
  Alert,
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
  ShieldMark,
  Stack,
  Text,
  Time,
} from '../ui'

interface NotificationsPageProps {
  groups: Group[]
  onGo: (path: string) => void
}

/**
 * The user's notifications (architecture.md, Notifications), newest first, in
 * two sections. Each notification is a sentence that opens its target when
 * clicked. New holds the unopened notifications. Opening one marks it read
 * and moves it to Earlier. Viewing the page marks nothing as read (Raphael,
 * 2026-11-06). Clear permanently deletes the notifications in Earlier.
 */
export function NotificationsPage({ groups, onGo }: NotificationsPageProps) {
  const { notifications, loading, error, hasMore, loadMore } = useNotifications()
  const read = useReadNotification()
  const clear = useClearNotifications()
  const [clearing, setClearing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const root = groups.find((g) => g.kind === 'root')
  const fresh = notifications.filter((n) => n.read_at == null)
  const earlier = notifications.filter((n) => n.read_at != null)

  const clearSeen = async () => {
    setClearing(true)
    setProblem(null)
    try {
      await clear()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not clear the notifications')
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
          groups={groups}
          onOpen={() => {
            read(n)
            onGo(targetOf(n, root?.id))
          }}
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
              {error && <Alert tone="error">{error.message}</Alert>}
              {!loading && notifications.length === 0 && <Text variant="secondary">No notifications yet.</Text>}
              {fresh.length > 0 && (
                <Stack gap={1}>
                  <Heading level={3}>New</Heading>
                  {rows(fresh)}
                </Stack>
              )}
              {earlier.length > 0 && (
                <Stack gap={1}>
                  <Row justify="between" align="center">
                    <Heading level={3}>Earlier</Heading>
                    <Button variant="ghost" icon="trash" busy={clearing} onClick={() => void clearSeen()}>
                      Clear
                    </Button>
                  </Row>
                  {problem && <Alert tone="error">{problem}</Alert>}
                  {rows(earlier)}
                </Stack>
              )}
              {hasMore && (
                <Row>
                  <Button variant="secondary" busy={loading} onClick={loadMore}>
                    Load more
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
  groups: Group[]
  onOpen: () => void
}

/**
 * One notification row, showing the actor, the action and the time. The row
 * is the button, so the actor's name is plain text and does not open a user
 * card. An unopened notification is marked new.
 */
function NotificationRow({ notification: n, groups, onOpen }: NotificationRowProps) {
  const actor = useAuthor(n.actor)
  const { topics } = useTopics()
  const sentence = `${actor.username} ${describe(n, groups, topics)}`
  const fresh = n.read_at == null
  return (
    <ListItem>
      <ListRow label={fresh ? `${sentence}, new` : sentence} onClick={onOpen}>
        <Avatar name={actor.username} picture={actor.picture} size="sm" />
        <Text as="span" variant="body" weight={fresh ? 'bold' : 'normal'}>
          {sentence}
        </Text>
        {/* Only the owner and moderators get these, so they carry the shield (architecture.md, Interface). */}
        {(n.kind === 'joined' || n.kind === 'report') && <ShieldMark />}
        <Text as="span" variant="small">
          <Time at={n.created_at} />
        </Text>
      </ListRow>
    </ListItem>
  )
}
