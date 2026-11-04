import type { User } from '../api'
import { NavAccount, NavBar, NavItem, Wordmark } from '../ui'

export type Page = 'home' | 'people' | 'settings' | 'menu'

interface SidebarProps {
  me: User
  page: Page
  expanded: boolean
  onNavigate: (page: Page) => void
  onToggle: () => void
}

/**
 * The left navigation. Search and Notifications mark where those features
 * will live; the rest is live.
 */
export function Sidebar({ me, page, expanded, onNavigate, onToggle }: SidebarProps) {
  return (
    <NavBar
      expanded={expanded}
      head={<Wordmark expanded={expanded} />}
      foot={
        <>
          <NavAccount username={me.username} expanded={expanded} />
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
        current={page === 'home'}
        onClick={() => onNavigate('home')}
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
    </NavBar>
  )
}
