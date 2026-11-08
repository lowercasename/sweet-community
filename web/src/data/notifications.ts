import type { Group, Marker, Notification, Topic } from '../api'
import { groupPath, postPath, profilePath } from '../routes'

/** The notifications stream's marker name. A room's chat and feed each have their own stream name. */
export const NOTIFICATIONS = 'notifications'
export const chatStream = (groupId: string) => `chat:${groupId}`
export const feedStream = (groupId: string) => `feed:${groupId}`

/** Which of a group's streams have unread content. The group is marked unread when either is. */
export interface UnreadPlace {
  chat: boolean
  feed: boolean
}

/** The time the user has read a stream up to, or undefined if never. */
export function markerOf(markers: Marker[] | undefined, stream: string): number | undefined {
  return markers?.find((m) => m.stream === stream)?.read_at
}

/** The groups with unread content, by group id, computed from the user's chat and feed markers. */
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

/** Whether either stream of a group has unread content. */
export const anyUnread = (p: UnreadPlace | undefined) => p !== undefined && (p.chat || p.feed)

/** The notification's description, shown after the actor's name. A room the user is no longer in has no name in the cache. */
export function describe(n: Notification, groups: Group[], topics: Topic[] = []): string {
  switch (n.kind) {
    case 'topic_post': {
      const topic = topics.find((t) => t.id === n.topic_id)
      return topic ? `posted in ${topic.name}` : 'posted in a topic'
    }
    case 'comment':
      return 'commented on your post'
    case 'added': {
      const room = groups.find((g) => g.id === n.group_id)
      return `added you to ${room ? room.name : 'a room'}`
    }
    case 'mention': {
      if (n.post_id) return 'mentioned you in a post'
      const room = groups.find((g) => g.id === n.group_id)
      return `mentioned you in ${room ? (room.kind === 'root' ? 'the chat' : room.name) : 'a room'}`
    }
    case 'joined':
      return 'joined the community'
    case 'message':
      return 'messaged you'
    case 'reply': {
      const room = groups.find((g) => g.id === n.group_id)
      return `replied to your message in ${room ? (room.kind === 'root' ? 'the chat' : room.name) : 'a room'}`
    }
  }
}

/** The path a notification opens. A notification about a post opens the post's page. A join opens the user's profile. Any other opens the room or conversation. */
export function targetOf(n: Notification, rootId?: string): string {
  if (n.post_id) return postPath(n.post_id)
  if (n.kind === 'joined') return profilePath(n.actor.username)
  // A mention or reply in chat opens the chat at its message.
  if (n.message_id) return `${groupPath(n.group_id, rootId)}?message=${encodeURIComponent(n.message_id)}`
  return groupPath(n.group_id, rootId)
}
