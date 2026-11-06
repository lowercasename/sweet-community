import type { Group, User } from '../api'
import { conversationsOf, hiddenOf } from '../data/groups'
import { anyUnread, type UnreadPlace } from '../data/notifications'
import { useUsers } from '../data/hooks'
import { MESSAGES, NEW_MESSAGE, groupPath } from '../routes'
import { Avatar, NavItem, NavSection } from '../ui'
import { groupLabel } from './GroupView'

/** How many conversations the nav shows: the latest five, and the open one. */
export const SHOWN = 5

/** The other person of a conversation, as they are now: the conversation's face. */
export function other(group: Group, me: User, users?: Map<string, User>): User | undefined {
  const u = (group.members ?? []).find((x) => x.id !== me.id)
  return u && (users?.get(u.id) ?? u)
}

/** A conversation's mark, in the slot a room's tile takes: the other person's face. */
export function ConversationFace({ group, me }: { group: Group; me: User }) {
  const { data: users } = useUsers()
  const them = other(group, me, users)
  return <Avatar name={them?.username ?? ''} picture={them?.picture} size="sm" decorative />
}

interface ConversationsSectionProps {
  groups: Group[]
  me: User
  /** The current path, when the column marks the page being viewed. */
  location?: string
  /** The places with something unread, by group id. */
  places: Map<string, UnreadPlace>
  expanded: boolean
  onGo: (path: string) => void
}

/**
 * The Messages section of the nav (architecture.md, Layout): New message as
 * its own control, the five conversations with the latest word, the open
 * one too if it is older, each named by its other person and marked by
 * their face, and All messages at the foot when there is more than it
 * shows (Raphael, 2026-11-06: with five or fewer it was a row for nothing). A conversation is a room
 * without a name, so it sits with the rooms, drawn the same way.
 */
export function ConversationsSection({ groups, me, location, places, expanded, onGo }: ConversationsSectionProps) {
  const all = conversationsOf(groups)
  const open = location
    ? all.find((g) => location === groupPath(g.id) || location.startsWith(groupPath(g.id) + '/'))
    : undefined
  const shown = all.slice(0, SHOWN)
  if (open && !shown.includes(open)) shown.push(open)
  // All messages earns its place only when the section does not show everything: more than the five, or hidden ones to bring back; never on the collapsed bar.
  const more = expanded && (all.length > SHOWN || hiddenOf(groups).length > 0)
  return (
    <NavSection
      title="Messages"
      expanded={expanded}
      action={{
        icon: 'plus',
        label: 'New message',
        current: location === NEW_MESSAGE,
        onClick: () => onGo(NEW_MESSAGE),
      }}
    >
      {shown.map((g) => (
        <NavItem
          key={g.id}
          mark={<ConversationFace group={g} me={me} />}
          label={groupLabel(g, me)}
          expanded={expanded}
          size="sm"
          dot={anyUnread(places.get(g.id))}
          current={g === open}
          onClick={() => onGo(groupPath(g.id))}
        />
      ))}
      {more && (
        <NavItem
          icon="mail"
          label="All messages"
          expanded={expanded}
          size="sm"
          current={location === MESSAGES}
          onClick={() => onGo(MESSAGES)}
        />
      )}
    </NavSection>
  )
}
