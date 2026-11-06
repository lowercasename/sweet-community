import type { Group, User } from '../api'
import { roomsOf } from '../data/groups'
import { useAuthor, useUnreadPlaces } from '../data/hooks'
import { anyUnread } from '../data/notifications'
import { NEW_ROOM, groupPath, profilePath } from '../routes'
import { Avatar, Card, Hairline, NavItem, NavSection, Pane, Stack, Tile } from '../ui'
import { ConversationsSection } from './ConversationsSection'

interface MenuPageProps {
  me: User
  groups: Group[]
  onGo: (path: string) => void
  onLogout: () => void
}

/**
 * The phone's menu: what the nav column holds, in the same blocks, with
 * the account first and Sign out last. Search and Notifications are tabs, so they
 * are not repeated here. It is the whole screen, flush, under no bar: a menu
 * is not a view to be named (Raphael, 2026-11-06).
 */
export function MenuPage({ me, groups, onGo, onLogout }: MenuPageProps) {
  const live = useAuthor(me)
  const places = useUnreadPlaces()
  const root = groups.find((g) => g.kind === 'root')
  const mine = roomsOf(groups)
  const canCreate = root?.can.create_groups === true
  return (
    <Pane flush>
      <Card flush>
        <Stack gap={1}>
          <NavItem
            mark={<Avatar name={live.username} picture={live.picture} size="sm" decorative />}
            label={live.username}
            expanded
            onClick={() => onGo(profilePath(live.username))}
          />
          <Hairline />
          <NavItem
            icon="home"
            label="Home"
            expanded
            dot={!!root && anyUnread(places.get(root.id))}
            onClick={() => onGo('/')}
          />
          {(mine.length > 0 || canCreate) && (
            <NavSection
              title="Rooms"
              expanded
              action={canCreate ? { icon: 'plus', label: 'New room', onClick: () => onGo(NEW_ROOM) } : undefined}
            >
              {mine.map((g) => (
                <NavItem
                  key={g.id}
                  mark={<Tile name={g.name} />}
                  label={g.name}
                  expanded
                  size="sm"
                  dot={anyUnread(places.get(g.id))}
                  onClick={() => onGo(groupPath(g.id))}
                />
              ))}
            </NavSection>
          )}
          <ConversationsSection groups={groups} me={me} places={places} expanded onGo={onGo} />
          <Hairline />
          <NavItem icon="people" label="People" expanded onClick={() => onGo('/people')} />
          <Hairline />
          <NavItem icon="logout" label="Sign out" expanded onClick={onLogout} />
        </Stack>
      </Card>
    </Pane>
  )
}
