import type { User } from '../api'
import { useGroups } from '../data/hooks'
import {
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
import { groupPath } from '../routes'
import { activity, conversationsOf } from '../data/groups'
import { ConversationFaces } from './ConversationsSection'
import { groupLabel } from './GroupView'

interface MessagesPageProps {
  me: User
  onGo: (path: string) => void
}

/**
 * All my conversations, latest word first (architecture.md, Layout): the
 * nav shows the latest five, this page every one, each opening at its own
 * URL under its bar like any room.
 */
export function MessagesPage({ me, onGo }: MessagesPageProps) {
  const { groups, loading } = useGroups()
  const dms = conversationsOf(groups)
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
                    No messages yet. Start one with New message, or from someone's name on the People page.
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
                    return (
                      <ListItem key={g.id}>
                        <ListRow label={label} onClick={() => onGo(groupPath(g.id))}>
                          <ConversationFaces group={g} me={me} />
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
