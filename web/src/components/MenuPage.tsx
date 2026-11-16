import type { Group, User } from '../api'
import { roomsOf } from '../data/groups'
import { useRoomSidebar, useAuthor, useRules, useUnreadPlaces } from '../data/hooks'
import { anyUnread } from '../data/notifications'
import { BROWSE_ROOMS, NEW_ROOM, RULES, groupPath, profilePath, COMMUNITY } from '../routes'
import { Avatar, Card, Hairline, NavItem, NavSection, Pane, shieldText, Stack, Tile } from '../ui'
import { ConversationsSection } from './ConversationsSection'

interface MenuPageProps {
  me: User
  groups: Group[]
  onGo: (path: string) => void
  onLogout: () => void
}

/**
 * The phone menu. It contains the same items as the nav column, in the same
 * sections, with the account first and Sign out last. Search and
 * Notifications are tabs, so they are not repeated here. The menu fills the
 * whole screen with no inset and no bar above it, because a menu is not a
 * view that needs a title.
 */
export function MenuPage({ me, groups, onGo, onLogout }: MenuPageProps) {
  const rules = useRules()
  const live = useAuthor(me)
  const places = useUnreadPlaces()
  const root = groups.find((g) => g.kind === 'root')
  const sidebar = useRoomSidebar()
  const saved = new Set(sidebar.data?.rooms.filter((r) => r.in_sidebar).map((r) => r.group_id))
  const mine = roomsOf(groups).filter((g) => saved.has(g.id))
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
          <NavSection
            title="Rooms"
            expanded
            action={canCreate ? { icon: 'plus', label: 'New room', onClick: () => onGo(NEW_ROOM) } : undefined}
          >
            {mine.map((g) => (
              <NavItem
                key={g.id}
                mark={<Tile name={g.name} picture={g.picture} />}
                label={g.name}
                privateRoom={g.visibility === 'private'}
                expanded
                size="sm"
                dot={anyUnread(places.get(g.id))}
                onClick={() => onGo(groupPath(g.id))}
              />
            ))}
            <NavItem icon="browse" label="Browse Rooms" expanded size="sm" onClick={() => onGo(BROWSE_ROOMS)} />
          </NavSection>
          <ConversationsSection groups={groups} me={me} places={places} expanded onGo={onGo} />
          <Hairline />
          <NavItem icon="people" label="People" expanded onClick={() => onGo('/people')} />
          {(root?.can.manage_instance || root?.can.manage_rules) && (
            <NavItem
              icon="settings"
              label="Community"
              expanded
              shield={shieldText.staffSee}
              onClick={() => onGo(COMMUNITY)}
            />
          )}
          {/* On the phone the rules are here, at the end of the menu, not in Home's bar. */}
          {rules && <NavItem icon="rules" label="Rules" expanded onClick={() => onGo(RULES)} />}
          <Hairline />
          <NavItem icon="logout" label="Sign out" expanded onClick={onLogout} />
        </Stack>
      </Card>
    </Pane>
  )
}
