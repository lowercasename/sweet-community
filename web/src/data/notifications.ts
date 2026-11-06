import type { Group, Marker, Notification } from '../api'
import { groupPath, postPath } from '../routes'

/** The notifications stream's marker name; a room's chat and feed each have their own. */
export const NOTIFICATIONS = 'notifications'
export const chatStream = (groupId: string) => `chat:${groupId}`
export const feedStream = (groupId: string) => `feed:${groupId}`

/** What is unread in a place, by stream. A place is marked when either is. */
export interface UnreadPlace {
  chat: boolean
  feed: boolean
}

/** Where I have read a stream to, or nothing if never. */
export function markerOf(markers: Marker[] | undefined, stream: string): number | undefined {
  return markers?.find((m) => m.stream === stream)?.read_at
}

/** The places with something unread, by group id, from my chat and feed markers. */
export function unreadPlaces(markers: Marker[]): Map<string, UnreadPlace> {
  const out = new Map<string, UnreadPlace>()
  for (const m of markers) {
    if (m.unread <= 0) continue
    const [kind, id] = [m.stream.slice(0, 5), m.stream.slice(5)]
    if (kind !== 'chat:' && kind !== 'feed:') continue
    const place = out.get(id) ?? { chat: false, feed: false }
    if (kind === 'chat:') place.chat = true
    else place.feed = true
    out.set(id, place)
  }
  return out
}

/** Is anything in this place unread? */
export const anyUnread = (p: UnreadPlace | undefined) => p !== undefined && (p.chat || p.feed)

/** The ones newer than my marker. */
export function unreadOf(notifications: Notification[], readAt: number | undefined): Notification[] {
  return notifications.filter((n) => n.created_at > (readAt ?? 0))
}

/** What was done, in words after the actor's name. A room I am no longer in has no name to give. */
export function describe(n: Notification, groups: Group[]): string {
  switch (n.kind) {
    case 'comment':
      return 'commented on your post'
    case 'added': {
      const room = groups.find((g) => g.id === n.group_id)
      return `added you to ${room ? room.name : 'a room'}`
    }
  }
}

/** Where a notification leads: a comment to its post's page, a room to the room. */
export function targetOf(n: Notification, rootId?: string): string {
  if (n.kind === 'comment' && n.post_id) return postPath(n.post_id)
  return groupPath(n.group_id, rootId)
}
