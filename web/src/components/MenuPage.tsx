import type { Group, User } from '../api'
import { useAuthor } from '../data/hooks'
import { Card, NavAccount, NavItem, Pane, Stack } from '../ui'
import { groupLabel } from './GroupView'
import type { Page } from './Sidebar'

interface MenuPageProps {
  me: User
  groups: Group[]
  onNavigate: (page: Page) => void
  onOpenGroup: (id: string) => void
  onLogout: () => void
}

/** The phone's menu: what the nav column holds on a wide screen. */
export function MenuPage({ me, groups, onNavigate, onOpenGroup, onLogout }: MenuPageProps) {
  const live = useAuthor(me)
  const root = groups.find((g) => g.kind === 'root')
  return (
    <Pane>
      <Card>
        <Stack gap={1}>
          <NavAccount username={live.username} picture={live.picture} expanded />
          <NavItem icon="people" label="People" expanded onClick={() => onNavigate('people')} />
          <NavItem icon="settings" label="Settings" expanded onClick={() => onNavigate('settings')} />
          {groups
            .filter((g) => g.kind !== 'root')
            .map((g) => (
              <NavItem
                key={g.id}
                icon={g.kind === 'dm' ? 'chat' : 'people'}
                label={groupLabel(g, me)}
                expanded
                onClick={() => onOpenGroup(g.id)}
              />
            ))}
          {root?.can.create_groups && (
            <NavItem icon="plus" label="New group" expanded onClick={() => onNavigate('new-group')} />
          )}
          <NavItem icon="logout" label="Sign out" expanded onClick={onLogout} />
        </Stack>
      </Card>
    </Pane>
  )
}
