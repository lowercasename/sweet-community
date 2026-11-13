import { useState } from 'react'
import type { Group, Notification } from '../api'
import {
  useAuthor,
  useClearNotifications,
  useNotifications,
  useReadNotification,
  useReadAllNotifications,
  useUnreadNotifications,
  useTopics,
} from '../data/hooks'
import { describe, targetOf } from '../data/notifications'
import { NotificationsCard } from './NotificationsCard'
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
 * The user's notifications, newest first, in
 * two sections. Each notification is a sentence that opens its target when
 * clicked. New holds the unopened notifications. Opening one marks it read
 * and moves it to Earlier. Viewing the page marks nothing as read. Bulk actions mark all read or clear both sections.
 */
export function NotificationsPage({ groups, onGo }: NotificationsPageProps) {
  const { notifications, loading, error, hasMore, loadMore } = useNotifications()
  const read = useReadNotification()
  const clear = useClearNotifications()
  const readAll = useReadAllNotifications()
  const unread = useUnreadNotifications()
  const [pending, setPending] = useState<'read' | 'clear' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const root = groups.find((g) => g.kind === 'root')
  const fresh = notifications.filter((n) => n.read_at == null)
  const earlier = notifications.filter((n) => n.read_at != null)

  const bulk = async (kind: 'read' | 'clear', action: () => Promise<void>) => {
    setPending(kind)
    setProblem(null)
    try {
      await action()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not update the notifications')
    } finally {
      setPending(null)
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
          <Stack gap={3}>
            <Card>
              <Stack gap={2}>
                {error && <Alert tone="error">{error.message}</Alert>}
                {problem && <Alert tone="error">{problem}</Alert>}
                {loading && notifications.length === 0 && <Text variant="secondary">Loading notifications…</Text>}
                {!loading && notifications.length === 0 && <Text variant="secondary">Nice and quiet in here.</Text>}
                {fresh.length > 0 && (
                  <Stack gap={1}>
                    <Heading level={2}>New</Heading>
                    {rows(fresh)}
                  </Stack>
                )}
                {earlier.length > 0 && (
                  <Stack gap={1}>
                    <Heading level={2}>Earlier</Heading>
                    {rows(earlier)}
                  </Stack>
                )}
                {notifications.length > 0 && (
                  <Row justify="end">
                    {unread && (
                      <Button
                        variant="secondary"
                        icon="check"
                        busy={pending === 'read'}
                        disabled={pending !== null}
                        onClick={() => void bulk('read', readAll)}
                      >
                        Mark all read
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      icon="trash"
                      busy={pending === 'clear'}
                      disabled={pending !== null}
                      onClick={() => void bulk('clear', clear)}
                    >
                      Clear all
                    </Button>
                  </Row>
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
            <NotificationsCard title="Notifications settings" />
          </Stack>
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
  const sentence = actor ? `${actor.username} ${describe(n, groups, topics)}` : describe(n, groups, topics)
  const fresh = n.read_at == null
  return (
    <ListItem>
      <ListRow label={fresh ? `${sentence}, new` : sentence} onClick={onOpen}>
        {actor && <Avatar name={actor.username} picture={actor.picture} size="sm" />}
        <Stack gap={0}>
          <Text as="span" variant="body" weight={fresh ? 'bold' : 'normal'}>
            {sentence}
            {/* Only the owner and moderators get these, so they carry the shield. */}
            {(n.kind === 'joined' || n.kind === 'report') && <ShieldMark inline />}
          </Text>
          <Text as="span" variant="small">
            <Time at={n.created_at} />
            {(n.updates ?? 1) > 1 && ` · ${n.updates} updates`}
          </Text>
        </Stack>
      </ListRow>
    </ListItem>
  )
}
