import type { Group } from './api'

/**
 * Where things live (architecture.md, Layout). To people a group is a
 * room: the root group is Home at `/`, every other group is a room at
 * `/r/<id>` (a DM too), and a new one is made at `/rooms/new`.
 */
export function groupPath(id: string, rootId?: string): string {
  return id === rootId ? '/' : `/r/${encodeURIComponent(id)}`
}

export const NEW_ROOM = '/rooms/new'

/** The full list of my conversations, and where a new one starts. */
export const MESSAGES = '/messages'
export const NEW_MESSAGE = '/messages/new'

/** What was done to me (architecture.md, Notifications). */
export const NOTIFICATIONS = '/notifications'

/** A person's page (architecture.md, Accounts). */
export const profilePath = (name: string) => `/u/${encodeURIComponent(name)}`

/** A post's own address (architecture.md, Posts). */
export const postPath = (id: string) => `/p/${encodeURIComponent(id)}`

/** A room's members page. */
export const membersPath = (g: Group) => `${groupPath(g.id)}/members`
