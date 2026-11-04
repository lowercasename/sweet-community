import type { Group, User } from '../api'
import { useAuthor } from '../data/hooks'
import { NavAccount, NavBar, NavItem, Wordmark } from '../ui'
import { groupLabel } from './GroupView'

export type Page = 'home' | 'people' | 'settings' | 'menu' | 'members' | 'new-group'

interface SidebarProps {
  me: User
  groups: Group[]
  /** The group whose view is showing, when the page is a group's view. */
  currentGroupId?: string
  page: Page
  expanded: boolean
  onNavigate: (page: Page) => void
  onOpenGroup: (id: string) => void
  onToggle: () => void
}

/**
 * The left navigation: Home is the root group; then the pages; then my
 * groups and DMs, and New group when the root group says I may.
 */
export function Sidebar({
  me,
  groups,
  currentGroupId,
  page,
  expanded,
  onNavigate,
  onOpenGroup,
  onToggle,
}: SidebarProps) {
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
      <NavItem
        icon="home"
        label="Home"
        expanded={expanded}
        current={page === 'home' && currentGroupId === root?.id}
        onClick={() => root && onOpenGroup(root.id)}
      />
      <NavItem icon="search" label="Search" expanded={expanded} />
      <NavItem icon="bell" label="Notifications" expanded={expanded} />
      <NavItem
        icon="people"
        label="People"
        expanded={expanded}
        current={page === 'people'}
        onClick={() => onNavigate('people')}
      />
      <NavItem
        icon="settings"
        label="Settings"
        expanded={expanded}
        current={page === 'settings'}
        onClick={() => onNavigate('settings')}
      />
      {mine.map((g) => (
        <NavItem
          key={g.id}
          icon={g.kind === 'dm' ? 'chat' : 'people'}
          label={groupLabel(g, me)}
          expanded={expanded}
          current={page === 'home' && currentGroupId === g.id}
          onClick={() => onOpenGroup(g.id)}
        />
      ))}
      {root?.can.create_groups && (
        <NavItem
          icon="plus"
          label="New group"
          expanded={expanded}
          current={page === 'new-group'}
          onClick={() => onNavigate('new-group')}
        />
      )}
    </NavBar>
  )
}
