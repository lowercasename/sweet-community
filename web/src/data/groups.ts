import type { Group } from '../api'

/*
 * Views of my groups for the nav and the Messages page (architecture.md,
 * Layout): pure functions over what the cache holds.
 */

/** When a conversation last had a word in it, or when it was opened. */
export const activity = (g: Group) => g.last_message_at ?? g.created_at

/** The conversations I am in, latest word first. */
export const conversationsOf = (groups: Group[]) =>
  groups.filter((g) => g.kind === 'dm' && g.left_at == null).sort((a, b) => activity(b) - activity(a))

/** The conversations I have stepped out of, latest word first; opening one steps back in. */
export const steppedOutOf = (groups: Group[]) =>
  groups.filter((g) => g.kind === 'dm' && g.left_at != null).sort((a, b) => activity(b) - activity(a))

/** My rooms, alphabetically with case aside: places keep a stable order. */
export const roomsOf = (groups: Group[]) =>
  groups
    .filter((g) => g.kind === 'group')
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
