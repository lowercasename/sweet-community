import type { User } from '../api'
import { NavAccount, NavBar, NavItem, Wordmark } from '../ui'

interface SidebarProps {
  me: User | null
  expanded: boolean
  onToggle: () => void
}

/**
 * The left navigation. Only Home does anything yet; the other entries mark
 * where search, notifications, people and settings will live.
 */
export function Sidebar({ me, expanded, onToggle }: SidebarProps) {
  return (
    <NavBar
      expanded={expanded}
      head={<Wordmark expanded={expanded} />}
      foot={
        <>
          <NavAccount username={me?.username ?? null} expanded={expanded} />
          <NavItem
            icon={expanded ? 'collapse' : 'expand'}
            label={expanded ? 'Collapse menu' : 'Expand menu'}
            expanded={expanded}
            onClick={onToggle}
          />
        </>
      }
    >
      <NavItem icon="home" label="Home" expanded={expanded} current />
      <NavItem icon="search" label="Search" expanded={expanded} />
      <NavItem icon="bell" label="Notifications" expanded={expanded} />
      <NavItem icon="people" label="People" expanded={expanded} />
      <NavItem icon="settings" label="Settings" expanded={expanded} />
    </NavBar>
  )
}
