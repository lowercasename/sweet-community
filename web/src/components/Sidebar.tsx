import type { Group, User } from '../api'
import { useAuthor } from '../data/hooks'
import { NEW_ROOM, groupPath } from '../routes'
import { Hairline, NavAccount, NavBar, NavItem, NavSection, Tile, Wordmark } from '../ui'
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
 * the tools that reach across every place (Search, Alerts), and the house
 * (People, Settings, me).
 */
export function Sidebar({ me, groups, location, expanded, onGo, onToggle }: SidebarProps) {
  const live = useAuthor(me)
  const root = groups.find((g) => g.kind === 'root')
  const mine = groups.filter((g) => g.kind === 'group')
  const canCreate = root?.can.create_groups === true
  return (
    <NavBar
      expanded={expanded}
      head={<Wordmark expanded={expanded} />}
      foot={
        <>
          <NavAccount username={live.username} picture={live.picture} expanded={expanded} />
          <NavItem
            icon={expanded ? 'collapse' : 'expand'}
            label={expanded ? 'Collapse' : 'Expand'}
            expanded={expanded}
            onClick={onToggle}
          />
        </>
      }
    >
      <NavItem icon="home" label="Home" expanded={expanded} current={location === '/'} onClick={() => onGo('/')} />
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
              mark={<Tile name={g.name} />}
              label={g.name}
              expanded={expanded}
              size="sm"
              current={at(location, groupPath(g.id))}
              onClick={() => onGo(groupPath(g.id))}
            />
          ))}
        </NavSection>
      )}
      <ConversationsSection groups={groups} me={me} location={location} expanded={expanded} onGo={onGo} />
      <Hairline />
      <NavItem icon="search" label="Search" expanded={expanded} />
      <NavItem icon="bell" label="Alerts" expanded={expanded} />
      <Hairline />
      <NavItem
        icon="people"
        label="People"
        expanded={expanded}
        current={at(location, '/people')}
        onClick={() => onGo('/people')}
      />
      <NavItem
        icon="settings"
        label="Settings"
        expanded={expanded}
        current={at(location, '/settings')}
        onClick={() => onGo('/settings')}
      />
    </NavBar>
  )
}
