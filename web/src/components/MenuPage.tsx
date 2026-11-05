import type { Group, User } from '../api'
import { useAuthor } from '../data/hooks'
import { Card, Hairline, NavAccount, NavItem, NavSection, Pane, Stack, Tile } from '../ui'

interface MenuPageProps {
  me: User
  groups: Group[]
  onGo: (path: string) => void
  onLogout: () => void
}

/**
 * The phone's menu: what the nav column holds, in the same blocks, with
 * the account first and Sign out last. Search and Alerts are tabs, so they
 * are not repeated here.
 */
export function MenuPage({ me, groups, onGo, onLogout }: MenuPageProps) {
  const live = useAuthor(me)
  const root = groups.find((g) => g.kind === 'root')
  const mine = groups.filter((g) => g.kind === 'group')
  const canCreate = root?.can.create_groups === true
  return (
    <Pane>
      <Card>
        <Stack gap={1}>
          <NavAccount username={live.username} picture={live.picture} expanded />
          <Hairline />
          <NavItem icon="home" label="Home" expanded onClick={() => onGo('/')} />
          {(mine.length > 0 || canCreate) && (
            <NavSection
              title="Groups"
              expanded
              action={canCreate ? { icon: 'plus', label: 'New group', onClick: () => onGo('/groups/new') } : undefined}
            >
              {mine.map((g) => (
                <NavItem
                  key={g.id}
                  mark={<Tile name={g.name} />}
                  label={g.name}
                  expanded
                  onClick={() => onGo(`/g/${encodeURIComponent(g.id)}`)}
                />
              ))}
            </NavSection>
          )}
          <NavItem icon="mail" label="Messages" expanded onClick={() => onGo('/messages')} />
          <Hairline />
          <NavItem icon="people" label="People" expanded onClick={() => onGo('/people')} />
          <NavItem icon="settings" label="Settings" expanded onClick={() => onGo('/settings')} />
          <Hairline />
          <NavItem icon="logout" label="Sign out" expanded onClick={onLogout} />
        </Stack>
      </Card>
    </Pane>
  )
}
