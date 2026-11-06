import type { Group, Marker, Notification } from '../api'
import { groupPath, postPath } from '../routes'

/** The notifications stream's marker name; a chat's is its group's. */
export const NOTIFICATIONS = 'notifications'
export const chatStream = (groupId: string) => `chat:${groupId}`

/** Where I have read a stream to, or nothing if never. */
export function markerOf(markers: Marker[] | undefined, stream: string): number | undefined {
  return markers?.find((m) => m.stream === stream)?.read_at
}

/** Unread messages per group, from my chat markers. */
export function chatUnread(markers: Marker[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of markers) if (m.stream.startsWith('chat:') && m.unread > 0) out.set(m.stream.slice(5), m.unread)
  return out
}

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
