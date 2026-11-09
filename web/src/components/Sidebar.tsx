import type { Group, User } from '../api'
import { roomsOf } from '../data/groups'
import { useAuthor, useRelease, useSettings, useUnreadPlaces, useUnreadNotifications } from '../data/hooks'
import { anyUnread } from '../data/notifications'
import { COMMUNITY, NEW_ROOM, NOTIFICATIONS, SEARCH, groupPath, profilePath } from '../routes'
import { Avatar, Hairline, NavBar, NavItem, NavNote, NavSection, shieldText, Tile, Wordmark } from '../ui'
import { ConversationsSection } from './ConversationsSection'

interface SidebarProps {
  me: User
  groups: Group[]
  /** The current path. The nav item for this path is marked as current. */
  location: string
  expanded: boolean
  onGo: (path: string) => void
  onToggle: () => void
}

/** Returns whether the location is the item's path or a page under it. */
function at(location: string, path: string): boolean {
  return location === path || location.startsWith(path + '/')
}

/**
 * The left navigation, in three blocks (architecture.md, Layout). The first
 * block lists the groups. It has Home, then the groups the user is in, with
 * New room as that section's own control, then the user's latest
 * conversations with All conversations at the bottom. The second block has the
 * tools that work across every group, which are Search and Notifications.
 * The third block has the community items. These are People, then Community
 * for the owner, then the user's own profile page, where Settings is reached.
 * Community is in the nav because a page about the community does not belong
 * under the owner's own page (Raphael, 2026-11-06). The top of the nav shows
 * the community's name.
 */
export function Sidebar({ me, groups, location, expanded, onGo, onToggle }: SidebarProps) {
  const live = useAuthor(me)
  const unread = useUnreadNotifications()
  const places = useUnreadPlaces()
  const root = groups.find((g) => g.kind === 'root')
  const mine = roomsOf(groups)
  const canCreate = root?.can.create_groups === true
  const { settings } = useSettings()
  const release = useRelease()
  return (
    <NavBar
      expanded={expanded}
      head={<Wordmark expanded={expanded} label={settings?.name} />}
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
          {/* The release, for telling which version a person is on. The collapsed column has no room for it. */}
          {expanded && release && <NavNote>{`Sweet ${release}`}</NavNote>}
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
          tour="rooms"
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
      <NavItem
        icon="search"
        label="Search"
        expanded={expanded}
        current={at(location, SEARCH)}
        onClick={() => onGo(SEARCH)}
      />
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
      {(root?.can.manage_instance || root?.can.manage_topics) && (
        <NavItem
          icon="settings"
          label="Community"
          tour="community"
          expanded={expanded}
          shield={shieldText.staffSee}
          current={at(location, COMMUNITY)}
          onClick={() => onGo(COMMUNITY)}
        />
      )}
    </NavBar>
  )
}
