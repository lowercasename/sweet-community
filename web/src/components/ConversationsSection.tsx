import type { Group, User } from '../api'
import { conversationsOf } from '../data/groups'
import { useUsers } from '../data/hooks'
import { MESSAGES, NEW_MESSAGE, groupPath } from '../routes'
import { FacePile, NavItem, NavSection } from '../ui'
import { groupLabel } from './GroupView'

/** How many conversations the nav shows: the latest five, and the open one. */
export const SHOWN = 5

/** The faces of a conversation's other people, as they are now. */
export function ConversationFaces({ group, me }: { group: Group; me: User }) {
  const { data: users } = useUsers()
  const others = (group.members ?? []).filter((u) => u.id !== me.id).map((u) => users?.get(u.id) ?? u)
  return <FacePile people={others.map((u) => ({ name: u.username, picture: u.picture }))} />
}

interface ConversationsSectionProps {
  groups: Group[]
  me: User
  /** The current path, when the column marks the page being viewed. */
  location?: string
  expanded: boolean
  onGo: (path: string) => void
}

/**
 * The Messages section of the nav (architecture.md, Layout): New message as
 * its own control, the five conversations with the latest word, the open
 * one too if it is older, each named by its other people and marked by
 * their faces, and All messages at the foot. A conversation is a room
 * without a name, so it sits with the rooms, drawn the same way.
 */
export function ConversationsSection({ groups, me, location, expanded, onGo }: ConversationsSectionProps) {
  const all = conversationsOf(groups)
  const open = location
    ? all.find((g) => location === groupPath(g.id) || location.startsWith(groupPath(g.id) + '/'))
    : undefined
  const shown = all.slice(0, SHOWN)
  if (open && !shown.includes(open)) shown.push(open)
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
          mark={<ConversationFaces group={g} me={me} />}
          label={groupLabel(g, me)}
          expanded={expanded}
          size="sm"
          current={g === open}
          onClick={() => onGo(groupPath(g.id))}
        />
      ))}
      <NavItem
        icon="mail"
        label="All messages"
        expanded={expanded}
        size="sm"
        current={location === MESSAGES}
        onClick={() => onGo(MESSAGES)}
      />
    </NavSection>
  )
}
