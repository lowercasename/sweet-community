import { useState } from 'react'
import type { Group, Notification } from '../api'
import { useAuthor, useClearNotifications, useNotifications, useReadNotification } from '../data/hooks'
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
 * a sentence that opens the thing, in two sections. New holds the ones I
 * have not opened; opening one reads it (looking at the page reads
 * nothing: Raphael, 2026-11-06) and it moves to Earlier, which Clear
 * deletes for good.
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
              {!loading && notifications.length === 0 && <Text variant="secondary">Nice and quiet in here.</Text>}
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
                    <Button variant="ghost" icon="trash" disabled={clearing} onClick={() => void clearSeen()}>
                      {clearing ? 'Clearing…' : 'Clear'}
                    </Button>
                  </Row>
                  {problem && <Alert tone="error">{problem}</Alert>}
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
  groups: Group[]
  onOpen: () => void
}

/** One line: who, what, when. The row is the control, so the name is text, not a card. Unopened, it is marked new. */
function NotificationRow({ notification: n, groups, onOpen }: NotificationRowProps) {
  const actor = useAuthor(n.actor)
  const sentence = `${actor.username} ${describe(n, groups)}`
  const fresh = n.read_at == null
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
