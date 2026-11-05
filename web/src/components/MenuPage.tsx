import type { Group, User } from '../api'
import { roomsOf } from '../data/groups'
import { useAuthor } from '../data/hooks'
import { NEW_ROOM, groupPath } from '../routes'
import { Card, Hairline, NavAccount, NavItem, NavSection, Pane, Stack, Tile } from '../ui'
import { ConversationsSection } from './ConversationsSection'

interface MenuPageProps {
  me: User
  groups: Group[]
  onGo: (path: string) => void
  onLogout: () => void
}

/**
 * The phone's menu: what the nav column holds, in the same blocks, with
 * the account first and Sign out last. Search and Notifications are tabs, so they
 * are not repeated here.
 */
export function MenuPage({ me, groups, onGo, onLogout }: MenuPageProps) {
  const live = useAuthor(me)
  const root = groups.find((g) => g.kind === 'root')
  const mine = roomsOf(groups)
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
              title="Rooms"
              expanded
              action={canCreate ? { icon: 'plus', label: 'New room', onClick: () => onGo(NEW_ROOM) } : undefined}
            >
              {mine.map((g) => (
                <NavItem
                  key={g.id}
                  mark={<Tile name={g.name} />}
                  label={g.name}
                  expanded
                  size="sm"
                  onClick={() => onGo(groupPath(g.id))}
                />
              ))}
            </NavSection>
          )}
          <ConversationsSection groups={groups} me={me} expanded onGo={onGo} />
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
