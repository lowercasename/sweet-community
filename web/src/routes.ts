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

/** A room's members page. */
export const membersPath = (g: Group) => `${groupPath(g.id)}/members`
