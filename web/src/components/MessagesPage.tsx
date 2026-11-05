import type { Group, User } from '../api'
import { useAuthor, useGroups } from '../data/hooks'
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
import { groupLabel } from './GroupView'

interface MessagesPageProps {
  me: User
  onGo: (path: string) => void
}

/** When the conversation last had a word in it, or when it was opened. */
const activity = (g: Group) => g.last_message_at ?? g.created_at

/** A person's face as they are now, from the users cache. */
function LiveAvatar({ user }: { user: User }) {
  const live = useAuthor(user)
  return <Avatar name={live.username} picture={live.picture} size="sm" />
}

/**
 * My DMs, latest word first (architecture.md, Layout). A DM is a group in
 * the tables and a conversation here: it is not in the nav, it is in this
 * list, and it opens at its own URL under its bar like any group.
 */
export function MessagesPage({ me, onGo }: MessagesPageProps) {
  const { groups, loading } = useGroups()
  const dms = groups.filter((g) => g.kind === 'dm').sort((a, b) => activity(b) - activity(a))
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            <Stack gap={2}>
              <Heading level={2}>Messages</Heading>
              {!loading && dms.length === 0 && (
                <Stack gap={2}>
                  <Text variant="secondary">
                    No messages yet. A conversation starts from someone's name on the People page.
                  </Text>
                  <Row>
                    <Button variant="secondary" icon="people" onClick={() => onGo('/people')}>
                      People
                    </Button>
                  </Row>
                </Stack>
              )}
              {dms.length > 0 && (
                <List gap={1}>
                  {dms.map((g) => {
                    const label = groupLabel(g, me)
                    const others = (g.members ?? []).filter((u) => u.id !== me.id)
                    return (
                      <ListItem key={g.id}>
                        <ListRow label={label} onClick={() => onGo(`/g/${encodeURIComponent(g.id)}`)}>
                          <Row gap={1} align="center">
                            {others.map((u) => (
                              <LiveAvatar key={u.id} user={u} />
                            ))}
                          </Row>
                          <Text as="span" variant="name">
                            {label}
                          </Text>
                          <Text as="span" variant="small">
                            <Time at={activity(g)} />
                          </Text>
                        </ListRow>
                      </ListItem>
                    )
                  })}
                </List>
              )}
            </Stack>
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
