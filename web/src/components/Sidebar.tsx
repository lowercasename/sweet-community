import type { Group, User } from '../api'
import { useAuthor } from '../data/hooks'
import { NavAccount, NavBar, NavItem, Wordmark } from '../ui'
import { groupLabel } from './GroupView'

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
 * The left navigation: Home is the root group; then the pages; then my
 * groups and DMs, and New group when the root group says I may.
 */
export function Sidebar({ me, groups, location, expanded, onGo, onToggle }: SidebarProps) {
  const live = useAuthor(me)
  const root = groups.find((g) => g.kind === 'root')
  const mine = groups.filter((g) => g.kind !== 'root')
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
      <NavItem icon="search" label="Search" expanded={expanded} />
      <NavItem icon="bell" label="Notifications" expanded={expanded} />
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
      {mine.map((g) => {
        const path = `/g/${encodeURIComponent(g.id)}`
        return (
          <NavItem
            key={g.id}
            icon={g.kind === 'dm' ? 'chat' : 'people'}
            label={groupLabel(g, me)}
            expanded={expanded}
            current={at(location, path)}
            onClick={() => onGo(path)}
          />
        )
      })}
      {root?.can.create_groups && (
        <NavItem
          icon="plus"
          label="New group"
          expanded={expanded}
          current={location === '/groups/new'}
          onClick={() => onGo('/groups/new')}
        />
      )}
    </NavBar>
  )
}
