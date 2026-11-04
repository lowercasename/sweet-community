import type { User } from '../api'
import { Card, NavAccount, NavItem, Pane, Stack } from '../ui'
import type { Page } from './Sidebar'

interface MenuPageProps {
  me: User
  onNavigate: (page: Page) => void
  onLogout: () => void
}

/** The phone's menu: what the nav column holds on a wide screen. */
export function MenuPage({ me, onNavigate, onLogout }: MenuPageProps) {
  return (
    <Pane>
      <Card>
        <Stack gap={1}>
          <NavAccount username={me.username} expanded />
          <NavItem icon="people" label="People" expanded onClick={() => onNavigate('people')} />
          <NavItem icon="settings" label="Settings" expanded onClick={() => onNavigate('settings')} />
          <NavItem icon="logout" label="Sign out" expanded onClick={onLogout} />
        </Stack>
      </Card>
    </Pane>
  )
}
