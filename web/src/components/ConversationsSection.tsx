import type { Group, User } from '../api'
import { conversationsOf, hiddenOf } from '../data/groups'
import { anyUnread, type UnreadPlace } from '../data/notifications'
import { useUsers } from '../data/hooks'
import { CONVERSATIONS, NEW_CONVERSATION, groupPath } from '../routes'
import { Avatar, NavItem, NavSection } from '../ui'
import { groupLabel } from './GroupView'

/** How many conversations the nav shows. It shows the latest five, plus the open one. */
export const SHOWN = 5

/** Returns the other user in a conversation, with their current data. Their avatar is the conversation's avatar. */
export function other(group: Group, me: User, users?: Map<string, User>): User | undefined {
  const u = (group.members ?? []).find((x) => x.id !== me.id)
  return u && (users?.get(u.id) ?? u)
}

/** A conversation's icon, shown where a group's tile would be. It is the other user's avatar. */
export function ConversationFace({ group, me }: { group: Group; me: User }) {
  const { data: users } = useUsers()
  const them = other(group, me, users)
  return <Avatar name={them?.username ?? ''} picture={them?.picture} size="sm" decorative />
}

interface ConversationsSectionProps {
  groups: Group[]
  me: User
  /** The current path, set when the nav column highlights the page being viewed. */
  location?: string
  /** Each group's unread state, keyed by group id. */
  places: Map<string, UnreadPlace>
  expanded: boolean
  onGo: (path: string) => void
}

/**
 * The Conversations section of the nav (architecture.md, Layout). It has a New
 * message control of its own and the five conversations with the latest
 * messages. The open conversation is also listed if it is older. Each
 * conversation is labelled with the other user's name and shown with their
 * avatar. An All conversations link is shown at the bottom when there are more
 * conversations than the section lists. With five or fewer, the link was a
 * row with no purpose (Raphael, 2026-11-06). A conversation is a group
 * without a name, so its rows are drawn the same way as room rows.
 */
export function ConversationsSection({ groups, me, location, places, expanded, onGo }: ConversationsSectionProps) {
  const all = conversationsOf(groups)
  const open = location
    ? all.find((g) => location === groupPath(g.id) || location.startsWith(groupPath(g.id) + '/'))
    : undefined
  const shown = all.slice(0, SHOWN)
  if (open && !shown.includes(open)) shown.push(open)
  // Show All conversations only when the section does not list every conversation. That is the case when there are more
  // than five, or when there are hidden conversations to restore. Never show it on the collapsed bar.
  const more = expanded && (all.length > SHOWN || hiddenOf(groups).length > 0)
  return (
    <NavSection
      title="Conversations"
      expanded={expanded}
      action={{
        icon: 'plus',
        label: 'New conversation',
        current: location === NEW_CONVERSATION,
        onClick: () => onGo(NEW_CONVERSATION),
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
          label="All conversations"
          expanded={expanded}
          size="sm"
          current={location === CONVERSATIONS}
          onClick={() => onGo(CONVERSATIONS)}
        />
      )}
    </NavSection>
  )
}
