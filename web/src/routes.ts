import type { Group } from './api'

/**
 * The app's paths (architecture.md, Layout). To users a group is a room.
 * The root group is Home at `/`. Every other group, including a DM, is a
 * room at `/r/<id>`. A new room is created at `/rooms/new`.
 */
export function groupPath(id: string, rootId?: string): string {
  return id === rootId ? '/' : `/r/${encodeURIComponent(id)}`
}

export const NEW_ROOM = '/rooms/new'

/** The list of the user's conversations, and the page for starting a new one. */
export const MESSAGES = '/messages'
export const NEW_MESSAGE = '/messages/new'

/** The search page (architecture.md, Search). The `?q=` parameter carries the query. */
export const SEARCH = '/search'

/** The notifications page (architecture.md, Notifications). */
export const NOTIFICATIONS = '/notifications'

/** Password reset (architecture.md, Accounts). `/reset` requests a link, and `/reset/<token>` is the page the link opens. */
export const RESET = '/reset'

/** The owner's settings page for the community (architecture.md, Admin tools). Name, description, and who may create rooms. */
export const COMMUNITY = '/community'

/** The community's feed filtered to one topic (architecture.md, Topics). */
export const topicPath = (id: string) => `/?topic=${encodeURIComponent(id)}`

/** A user's profile page (architecture.md, Accounts). */
export const profilePath = (name: string) => `/u/${encodeURIComponent(name)}`

/** A post's own page (architecture.md, Posts). */
export const postPath = (id: string) => `/p/${encodeURIComponent(id)}`

/** A room's members page. */
export const membersPath = (g: Group) => `${groupPath(g.id)}/members`
