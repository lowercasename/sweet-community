import { useState } from 'react'
import { useGroups, useUnreadPlaces } from '../data/hooks'
import { roomsOf } from '../data/groups'
import { anyUnread } from '../data/notifications'
import { groupPath } from '../routes'
import {
  Alert,
  Card,
  Input,
  List,
  ListItem,
  Measure,
  NavItem,
  Pane,
  Row,
  ScrollArea,
  Segmented,
  Stack,
  Text,
  Tile,
} from '../ui'
import { RoomShortcut } from './RoomShortcut'

export function BrowseRooms({ onGo }: { onGo: (path: string) => void }) {
  const { groups, loading, error } = useGroups()
  const places = useUnreadPlaces()
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState('all')
  const rooms = roomsOf(groups).filter(
    (g) =>
      (visibility === 'all' || g.visibility === visibility) &&
      `${g.name} ${g.description ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  )
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            <Stack gap={3}>
              <Input label="Search rooms" value={search} onChange={setSearch} placeholder="Search rooms" />
              <Row justify="between" align="center">
                <Segmented
                  label="Room visibility"
                  segments={[
                    { key: 'all', label: 'All' },
                    { key: 'open', label: 'Open', icon: 'globe' },
                    { key: 'private', label: 'Private', icon: 'lock' },
                  ]}
                  value={visibility}
                  onChange={setVisibility}
                />
              </Row>
              {error && <Alert tone="error">{error.message}</Alert>}
              {loading ? (
                <Text variant="secondary">Loading rooms…</Text>
              ) : rooms.length === 0 ? (
                <Text variant="secondary">{search ? 'No rooms match your search.' : 'No rooms here yet.'}</Text>
              ) : (
                <List gap={1}>
                  {rooms.map((g) => (
                    <ListItem key={g.id}>
                      <Row align={g.description ? 'start' : 'center'} wrap="never" gap={1}>
                        <Stack fill>
                          <NavItem
                            label={g.name}
                            description={g.description}
                            mark={<Tile name={g.name} picture={g.picture} />}
                            privateRoom={g.visibility === 'private'}
                            expanded
                            dot={anyUnread(places.get(g.id))}
                            onClick={() => onGo(groupPath(g.id))}
                          />
                        </Stack>
                        <Row shrink={false}>
                          <RoomShortcut groupId={g.id} />
                        </Row>
                      </Row>
                    </ListItem>
                  ))}
                </List>
              )}
            </Stack>
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
