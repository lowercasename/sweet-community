import { useState } from 'react'
import type { Group, User } from '../api'
import { useGroupActions, useGroups, useUnreadPlaces } from '../data/hooks'
import {
  Alert,
  Button,
  Card,
  Dotted,
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
import { activity, conversationsOf, hiddenOf } from '../data/groups'
import { ConversationFace, other } from './ConversationsSection'
import { groupLabel } from './GroupView'

interface MessagesPageProps {
  me: User
  onGo: (path: string) => void
}

/**
 * Lists all the user's conversations, most recent message first
 * (architecture.md, Layout). The nav shows the latest five and this page
 * shows all of them. Each is labelled with the other user's name and opens at
 * its own URL, under its bar, like any group. Hidden conversations are listed
 * below the others. Opening one unhides it.
 */
export function MessagesPage({ me, onGo }: MessagesPageProps) {
  const { groups, loading } = useGroups()
  const { openDM } = useGroupActions()
  const places = useUnreadPlaces()
  const [problem, setProblem] = useState<string | null>(null)
  const dms = conversationsOf(groups)
  const out = hiddenOf(groups)
  const show = async (g: Group) => {
    try {
      const them = other(g, me)
      if (!them) return
      onGo(groupPath((await openDM(them.id)).id))
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not open the conversation')
    }
  }
  const row = (g: Group, onClick: () => void) => {
    const label = groupLabel(g, me)
    const n = places.get(g.id)?.chat ? 1 : 0
    return (
      <ListItem key={g.id}>
        <ListRow label={n > 0 ? `${label}, unread` : label} onClick={onClick}>
          <Dotted shown={n > 0}>
            <ConversationFace group={g} me={me} />
          </Dotted>
          <Text as="span" variant="name">
            {label}
          </Text>
          <Text as="span" variant="small">
            <Time at={activity(g)} />
          </Text>
        </ListRow>
      </ListItem>
    )
  }
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            <Stack gap={2}>
              {!loading && dms.length === 0 && out.length === 0 && (
                <Stack gap={2}>
                  <Text variant="secondary">No conversations yet. Start one from the People page.</Text>
                  <Row>
                    <Button variant="secondary" onClick={() => onGo('/people')}>
                      People
                    </Button>
                  </Row>
                </Stack>
              )}
              {dms.length > 0 && <List gap={1}>{dms.map((g) => row(g, () => onGo(groupPath(g.id))))}</List>}
              {out.length > 0 && (
                <Stack gap={1}>
                  <Heading level={3}>Hidden</Heading>
                  <Text variant="small">Opening a hidden conversation moves it back to your list.</Text>
                  {problem && <Alert tone="error">{problem}</Alert>}
                  <List gap={1}>{out.map((g) => row(g, () => void show(g)))}</List>
                </Stack>
              )}
            </Stack>
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
