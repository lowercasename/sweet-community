import type { Group, User } from '../api'
import { roomsOf } from '../data/groups'
import { useAuthor, useUnreadPlaces, useUnreadNotifications } from '../data/hooks'
import { anyUnread } from '../data/notifications'
import { NEW_ROOM, NOTIFICATIONS, groupPath, profilePath } from '../routes'
import { Avatar, Hairline, NavBar, NavItem, NavSection, Tile, Wordmark } from '../ui'
import { ConversationsSection } from './ConversationsSection'

interface SidebarProps {
  me: User
  groups: Group[]
  /** The current path; the item it names is marked. */
  location: string
  expanded: boolean
  onGo: (path: string) => void
  onToggle: () => void
}

/** Is this path the item, or a page under it? */
function at(location: string, path: string): boolean {
  return location === path || location.startsWith(path + '/')
}

/**
 * The left navigation, in three blocks (architecture.md, Layout): places
 * (Home, then the rooms I am in, with New room as that section's own
 * control, then my latest conversations with All messages at their foot),
 * the tools that reach across every place (Search, Notifications), and the house
 * (People, and me: my own page, where Settings is).
 */
export function Sidebar({ me, groups, location, expanded, onGo, onToggle }: SidebarProps) {
  const live = useAuthor(me)
  const unread = useUnreadNotifications()
  const places = useUnreadPlaces()
  const root = groups.find((g) => g.kind === 'root')
  const mine = roomsOf(groups)
  const canCreate = root?.can.create_groups === true
  return (
    <NavBar
      expanded={expanded}
      head={<Wordmark expanded={expanded} />}
      foot={
        <>
          <NavItem
            mark={<Avatar name={live.username} picture={live.picture} size="sm" decorative />}
            label={live.username}
            expanded={expanded}
            current={at(location, profilePath(live.username))}
            onClick={() => onGo(profilePath(live.username))}
          />
          <NavItem
            icon={expanded ? 'collapse' : 'expand'}
            label={expanded ? 'Collapse' : 'Expand'}
            expanded={expanded}
            onClick={onToggle}
          />
        </>
      }
    >
      <NavItem
        icon="home"
        label="Home"
        expanded={expanded}
        dot={!!root && anyUnread(places.get(root.id))}
        current={location === '/'}
        onClick={() => onGo('/')}
      />
      {(mine.length > 0 || canCreate) && (
        <NavSection
          title="Rooms"
          expanded={expanded}
          action={
            canCreate
              ? {
                  icon: 'plus',
                  label: 'New room',
                  current: location === NEW_ROOM,
                  onClick: () => onGo(NEW_ROOM),
                }
              : undefined
          }
        >
          {mine.map((g) => (
            <NavItem
              key={g.id}
              mark={<Tile name={g.name} picture={g.picture} />}
              label={g.name}
              expanded={expanded}
              size="sm"
              dot={anyUnread(places.get(g.id))}
              current={at(location, groupPath(g.id))}
              onClick={() => onGo(groupPath(g.id))}
            />
          ))}
        </NavSection>
      )}
      <ConversationsSection
        groups={groups}
        me={me}
        location={location}
        places={places}
        expanded={expanded}
        onGo={onGo}
      />
      <Hairline />
      <NavItem icon="search" label="Search" expanded={expanded} />
      <NavItem
        icon="bell"
        label="Notifications"
        expanded={expanded}
        dot={unread}
        current={at(location, NOTIFICATIONS)}
        onClick={() => onGo(NOTIFICATIONS)}
      />
      <Hairline />
      <NavItem
        icon="people"
        label="People"
        expanded={expanded}
        current={at(location, '/people')}
        onClick={() => onGo('/people')}
      />
    </NavBar>
  )
}
