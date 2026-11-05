import type { Group, User } from '../api'
import { useAuthor } from '../data/hooks'
import { Hairline, NavAccount, NavBar, NavItem, NavSection, Tile, Wordmark } from '../ui'

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

const groupPath = (g: Group) => `/g/${encodeURIComponent(g.id)}`

/**
 * The left navigation, in three blocks (architecture.md, Layout): places
 * (Home, then the named groups I am in, with New group as that section's
 * own control), the tools that reach across every place (Messages, Search,
 * Alerts), and the house (People, Settings, me). DMs are conversations,
 * not places: they live behind Messages, which is current inside one.
 */
export function Sidebar({ me, groups, location, expanded, onGo, onToggle }: SidebarProps) {
  const live = useAuthor(me)
  const root = groups.find((g) => g.kind === 'root')
  const mine = groups.filter((g) => g.kind === 'group')
  const inDM = groups.some((g) => g.kind === 'dm' && at(location, groupPath(g)))
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
          title="Groups"
          expanded={expanded}
          action={
            canCreate
              ? {
                  icon: 'plus',
                  label: 'New group',
                  current: location === '/groups/new',
                  onClick: () => onGo('/groups/new'),
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
              current={at(location, groupPath(g))}
              onClick={() => onGo(groupPath(g))}
            />
          ))}
        </NavSection>
      )}
      <Hairline />
      <NavItem
        icon="mail"
        label="Messages"
        expanded={expanded}
        current={at(location, '/messages') || inDM}
        onClick={() => onGo('/messages')}
      />
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
