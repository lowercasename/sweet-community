import type { Group, User } from '../api'
import { roomsOf } from '../data/groups'
import { useAuthor, useRules, useUnreadPlaces } from '../data/hooks'
import { anyUnread } from '../data/notifications'
import { NEW_ROOM, RULES, groupPath, profilePath, COMMUNITY } from '../routes'
import { Avatar, Card, Hairline, NavItem, NavSection, Pane, shieldText, Stack, Tile } from '../ui'
import { ConversationsSection } from './ConversationsSection'
import { isStoreApp } from '../install'
import { showCommunityList } from '../storeapp/native'

interface MenuPageProps {
  me: User
  groups: Group[]
  onGo: (path: string) => void
  onLogout: () => void
}

/**
 * The phone menu. It contains the same items as the nav column, in the same
 * sections, with the account first and Sign out last. In the store app, Your
 * communities comes just before Sign out. Search and
 * Notifications are tabs, so they are not repeated here. The menu fills the
 * whole screen with no inset and no bar above it, because a menu is not a
 * view that needs a title.
 */
export function MenuPage({ me, groups, onGo, onLogout }: MenuPageProps) {
  const rules = useRules()
  const live = useAuthor(me)
  const places = useUnreadPlaces()
  const root = groups.find((g) => g.kind === 'root')
  const mine = roomsOf(groups)
  const canCreate = root?.can.create_groups === true
  return (
    <Pane flush>
      <Card flush>
        <Stack gap={1}>
          <NavItem
            mark={<Avatar name={live.username} picture={live.picture} size="sm" decorative />}
            label={live.username}
            expanded
            onClick={() => onGo(profilePath(live.username))}
          />
          <Hairline />
          <NavItem
            icon="home"
            label="Home"
            expanded
            dot={!!root && anyUnread(places.get(root.id))}
            onClick={() => onGo('/')}
          />
          {(mine.length > 0 || canCreate) && (
            <NavSection
              title="Rooms"
              expanded
              action={canCreate ? { icon: 'plus', label: 'New room', onClick: () => onGo(NEW_ROOM) } : undefined}
            >
              {mine.map((g) => (
                <NavItem
                  key={g.id}
                  mark={<Tile name={g.name} picture={g.picture} />}
                  label={g.name}
                  expanded
                  size="sm"
                  dot={anyUnread(places.get(g.id))}
                  onClick={() => onGo(groupPath(g.id))}
                />
              ))}
            </NavSection>
          )}
          <ConversationsSection groups={groups} me={me} places={places} expanded onGo={onGo} />
          <Hairline />
          <NavItem icon="people" label="People" expanded onClick={() => onGo('/people')} />
          {(root?.can.manage_instance || root?.can.manage_topics) && (
            <NavItem
              icon="settings"
              label="Community"
              expanded
              shield={shieldText.staffSee}
              onClick={() => onGo(COMMUNITY)}
            />
          )}
          {/* On the phone the rules are here, at the end of the menu, not in Home's bar. */}
          {rules && <NavItem icon="rules" label="Rules" expanded onClick={() => onGo(RULES)} />}
          {isStoreApp() && (
            <NavItem icon="switch" label="Your communities" expanded onClick={() => void showCommunityList()} />
          )}
          <Hairline />
          <NavItem icon="logout" label="Sign out" expanded onClick={onLogout} />
        </Stack>
      </Card>
    </Pane>
  )
}
