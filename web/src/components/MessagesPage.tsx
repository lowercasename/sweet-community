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
 * All my conversations, latest word first (architecture.md, Layout): the
 * nav shows the latest five, this page every one, each named by its other
 * person and opening at its own URL under its bar like any room. Below them, the ones I have hidden;
 * opening one shows it again.
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
              {dms.length > 0 && <List gap={1}>{dms.map((g) => row(g, () => onGo(groupPath(g.id))))}</List>}
              {out.length > 0 && (
                <Stack gap={1}>
                  <Heading level={3}>Hidden</Heading>
                  <Text variant="small">Opening one brings it back.</Text>
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
