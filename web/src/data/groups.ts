import type { Group } from '../api'

/*
 * Views of the user's groups for the nav and the Messages page (architecture.md,
 * Layout). Pure functions over the groups in the cache.
 */

/** When a conversation's last message was sent, or when the conversation was created if it has no messages. */
export const activity = (g: Group) => g.last_message_at ?? g.created_at

/** The conversations the user is in, most recent message first. */
export const conversationsOf = (groups: Group[]) =>
  groups.filter((g) => g.kind === 'dm' && g.hidden_at == null).sort((a, b) => activity(b) - activity(a))

/** The conversations the user has hidden, most recent message first. Opening one unhides it. */
export const hiddenOf = (groups: Group[]) =>
  groups.filter((g) => g.kind === 'dm' && g.hidden_at != null).sort((a, b) => activity(b) - activity(a))

/** The user's rooms, sorted alphabetically ignoring case, so the order is stable. */
export const roomsOf = (groups: Group[]) =>
  groups
    .filter((g) => g.kind === 'group')
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
