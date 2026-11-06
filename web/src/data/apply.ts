import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type {
  Comment,
  Group,
  Marker,
  Member,
  Membership,
  Message,
  MessagePage,
  Notification,
  NotificationPage,
  Post,
  PostPage,
  Settings,
  User,
} from '../api'
import { ROOT_ID, keys } from './keys'

/**
 * The cache's one write path. Every event from the stream, and every reply
 * to one of our own writes, goes through here: an upsert or a delete per
 * resource, idempotent, so a replay changes nothing. Caches that are not
 * loaded are left alone; they will fetch fresh when they are wanted.
 * The server has already decided what this viewer may see.
 */
export function applyEvent(qc: QueryClient, kind: string, data: unknown): void {
  switch (kind) {
    case 'post':
      if (isPost(data)) upsertPost(qc, data)
      break
    case 'post_delete':
      if (hasId(data) && typeof data.group_id === 'string') deletePost(qc, data.id, data.group_id)
      break
    case 'comment':
      if (isComment(data)) upsertComment(qc, data)
      break
    case 'comment_delete':
      if (hasId(data) && typeof data.post_id === 'string' && typeof data.group_id === 'string')
        deleteComment(qc, data.id, data.post_id, data.group_id)
      break
    case 'message':
      if (isMessage(data)) upsertMessage(qc, data)
      break
    case 'message_delete':
      if (hasId(data) && typeof data.group_id === 'string') deleteMessage(qc, data.id, data.group_id)
      break
    case 'user':
      if (isUser(data)) upsertUser(qc, data)
      break
    case 'group':
      if (isGroup(data)) upsertGroup(qc, data)
      break
    case 'group_delete':
      if (hasId(data)) dropGroup(qc, data.id)
      break
    case 'membership':
      if (isMembership(data)) upsertMembership(qc, data)
      break
    case 'membership_delete':
      if (isMembershipRef(data)) deleteMembership(qc, data.group_id, data.user_id)
      break
    case 'notification':
      if (isNotification(data)) upsertNotification(qc, data)
      break
    case 'marker':
      if (isMarker(data)) upsertMarker(qc, data)
      break
    case 'settings':
      if (isSettings(data)) {
        qc.setQueryData<Settings>(keys.settings, data)
        // The root group carries the setting as a flag, computed per viewer on the server.
        void qc.invalidateQueries({ queryKey: keys.groups })
      }
      break
  }
}

type Posts = InfiniteData<PostPage>
type Notifications = InfiniteData<NotificationPage>
type Markers = { markers: Marker[] }
type Messages = InfiniteData<MessagePage>
type Thread = { comments: Comment[] }
type Users = { users: Member[] }
type Groups = { groups: Group[] }
type Members = { members: Membership[] }

/** A post as a loaded feed holds it, for a post page to start from. */
export function findPost(qc: QueryClient, id: string): Post | undefined {
  for (const [, data] of qc.getQueriesData<Posts>({ queryKey: ['posts'] })) {
    const found = data?.pages.flatMap((p) => p.posts).find((p) => p.id === id)
    if (found) return found
  }
  return undefined
}

function upsertPost(qc: QueryClient, post: Post) {
  // Someone else's new post I have not read counts on the room's feed; an edit is not new.
  const me = qc.getQueryData<User | null>(keys.me)
  if (post.edited_at == null && (!me || me.id !== post.author.id))
    bumpMarker(qc, `feed:${post.group_id}`, post.created_at)
  // Its page, if open, shows the same post.
  qc.setQueryData<Post>(keys.post(post.id), (old) => (old ? post : old))
  qc.setQueryData<Posts>(keys.posts(post.group_id), (old) => {
    if (!old) return old
    const known = old.pages.some((p) => p.posts.some((x) => x.id === post.id))
    const pages = known
      ? old.pages.map((p) => ({ ...p, posts: p.posts.map((x) => (x.id === post.id ? post : x)) }))
      : old.pages.map((p, i) => (i === 0 ? { ...p, posts: [post, ...p.posts] } : p))
    return { ...old, pages }
  })
}

function deletePost(qc: QueryClient, id: string, groupId: string) {
  qc.setQueryData<Posts>(keys.posts(groupId), (old) =>
    old ? { ...old, pages: old.pages.map((p) => ({ ...p, posts: p.posts.filter((x) => x.id !== id) })) } : old,
  )
  qc.removeQueries({ queryKey: keys.comments(id) })
  qc.removeQueries({ queryKey: keys.post(id) })
}

function countComments(qc: QueryClient, postId: string, groupId: string, by: number) {
  const counted = (x: Post) => ({ ...x, comment_count: Math.max(0, x.comment_count + by) })
  qc.setQueryData<Post>(keys.post(postId), (old) => (old ? counted(old) : old))
  qc.setQueryData<Posts>(keys.posts(groupId), (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            posts: p.posts.map((x) => (x.id === postId ? counted(x) : x)),
          })),
        }
      : old,
  )
}

function upsertComment(qc: QueryClient, c: Comment) {
  const thread = qc.getQueryData<Thread>(keys.comments(c.post_id))
  const known = thread?.comments.some((x) => x.id === c.id) ?? false
  if (thread) {
    qc.setQueryData<Thread>(keys.comments(c.post_id), {
      comments: known
        ? thread.comments.map((x) => (x.id === c.id ? c : x))
        : [...thread.comments, c].sort((a, b) => a.created_at - b.created_at),
    })
  }
  // A brand-new comment counts on its post; an edit, or a replay, does not.
  if (!known && c.edited_at == null) countComments(qc, c.post_id, c.group_id, 1)
}

function deleteComment(qc: QueryClient, id: string, postId: string, groupId: string) {
  const thread = qc.getQueryData<Thread>(keys.comments(postId))
  const known = thread?.comments.some((x) => x.id === id) ?? true
  if (thread) qc.setQueryData<Thread>(keys.comments(postId), { comments: thread.comments.filter((x) => x.id !== id) })
  if (known) countComments(qc, postId, groupId, -1)
}

function upsertMessage(qc: QueryClient, m: Message) {
  // Someone else's word I have not read counts on the room (architecture.md, Notifications).
  const me = qc.getQueryData<User | null>(keys.me)
  if (!me || me.id !== m.author.id) bumpMarker(qc, `chat:${m.group_id}`, m.created_at)
  // The newest word in a group is what orders the Messages page; a replay never moves it back.
  qc.setQueryData<Groups>(keys.groups, (old) =>
    old
      ? {
          groups: old.groups.map((g) =>
            g.id === m.group_id && (g.last_message_at ?? -Infinity) < m.created_at
              ? { ...g, last_message_at: m.created_at }
              : g,
          ),
        }
      : old,
  )
  qc.setQueryData<Messages>(keys.messages(m.group_id), (old) => {
    if (!old) return old
    const known = old.pages.some((p) => p.messages.some((x) => x.id === m.id))
    const pages = known
      ? old.pages.map((p) => ({ ...p, messages: p.messages.map((x) => (x.id === m.id ? m : x)) }))
      : old.pages.map((p, i) => (i === 0 ? { ...p, messages: [m, ...p.messages] } : p))
    return { ...old, pages }
  })
}

function deleteMessage(qc: QueryClient, id: string, groupId: string) {
  qc.setQueryData<Messages>(keys.messages(groupId), (old) =>
    old ? { ...old, pages: old.pages.map((p) => ({ ...p, messages: p.messages.filter((x) => x.id !== id) })) } : old,
  )
}

/** A person changed (their picture, their name): the same person everywhere. */
function upsertUser(qc: QueryClient, u: User) {
  qc.setQueryData<Users>(keys.users, (old) =>
    old ? { users: old.users.map((x) => (x.id === u.id ? { ...x, ...u } : x)) } : old,
  )
  const me = qc.getQueryData<User | null>(keys.me)
  if (me && me.id === u.id) qc.setQueryData<User>(keys.me, { ...me, ...u })
  // Their words everywhere: the author snapshots in loaded feeds, threads and
  // rooms follow too, so a renamed (or removed) person reads right at once,
  // whether or not they are still on the people list.
  const as = (a: User) => (a.id === u.id ? { ...a, ...u } : a)
  qc.setQueriesData<Posts>(
    { queryKey: ['posts'] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((p) => ({ ...p, posts: p.posts.map((x) => ({ ...x, author: as(x.author) })) })),
      },
  )
  qc.setQueriesData<Post>({ queryKey: ['post'] }, (old) => old && { ...old, author: as(old.author) })
  qc.setQueriesData<Thread>(
    { queryKey: ['comments'] },
    (old) => old && { comments: old.comments.map((c) => ({ ...c, author: as(c.author) })) },
  )
  qc.setQueriesData<Messages>(
    { queryKey: ['messages'] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((p) => ({ ...p, messages: p.messages.map((m) => ({ ...m, author: as(m.author) })) })),
      },
  )
}

/** One more thing on a stream, newer than where I have read to: it counts. A replay after a reconnect refetches the markers anyway. */
function bumpMarker(qc: QueryClient, stream: string, at: number) {
  qc.setQueryData<Markers>(keys.markers, (old) => {
    if (!old) return old
    const known = old.markers.some((x) => x.stream === stream)
    if (!known) return { markers: [...old.markers, { user_id: '', stream, read_at: 0, unread: 1 }] }
    return {
      markers: old.markers.map((x) => (x.stream === stream && at > x.read_at ? { ...x, unread: x.unread + 1 } : x)),
    }
  })
}

/** Something done to me: at the top of my list, once; and one more unread on the notifications stream. */
function upsertNotification(qc: QueryClient, n: Notification) {
  bumpMarker(qc, 'notifications', n.created_at)
  qc.setQueryData<Notifications>(keys.notifications, (old) => {
    if (!old) return old
    const known = old.pages.some((p) => p.notifications.some((x) => x.id === n.id))
    const pages = known
      ? old.pages.map((p) => ({ ...p, notifications: p.notifications.map((x) => (x.id === n.id ? n : x)) }))
      : old.pages.map((p, i) => (i === 0 ? { ...p, notifications: [n, ...p.notifications] } : p))
    return { ...old, pages }
  })
}

/** Where I have read a stream to, and what is still unread past it: forward only, as on the server, so a stale tab's word changes nothing. */
function upsertMarker(qc: QueryClient, m: Marker) {
  qc.setQueryData<Markers>(keys.markers, (old) => {
    const markers = old?.markers ?? []
    const known = markers.some((x) => x.stream === m.stream)
    return {
      markers: known ? markers.map((x) => (x.stream === m.stream && x.read_at <= m.read_at ? m : x)) : [...markers, m],
    }
  })
}

/** A stream I no longer have: its marker goes. */
function dropMarker(qc: QueryClient, stream: string) {
  qc.setQueryData<Markers>(keys.markers, (old) =>
    old ? { markers: old.markers.filter((x) => x.stream !== stream) } : old,
  )
}

function upsertGroup(qc: QueryClient, g: Group) {
  const known = qc.getQueryData<Groups>(keys.groups)?.groups.some((x) => x.id === g.id) ?? true
  qc.setQueryData<Groups>(keys.groups, (old) => {
    if (!old) return old
    return { groups: known ? old.groups.map((x) => (x.id === g.id ? g : x)) : [...old.groups, g] }
  })
  // A new place of mine has a chat marker.
  if (!known) void qc.invalidateQueries({ queryKey: keys.markers })
}

/** A group gone, or me gone from it: nothing of it stays in the cache. */
function dropGroup(qc: QueryClient, id: string) {
  qc.setQueryData<Groups>(keys.groups, (old) => (old ? { groups: old.groups.filter((x) => x.id !== id) } : old))
  qc.removeQueries({ queryKey: keys.posts(id) })
  qc.removeQueries({ queryKey: keys.messages(id) })
  qc.removeQueries({ queryKey: keys.members(id) })
  qc.removeQueries({
    predicate: (q) => q.queryKey[0] === 'post' && (q.state.data as Post | undefined)?.group_id === id,
  })
  dropMarker(qc, `chat:${id}`)
  dropMarker(qc, `feed:${id}`)
}

const ROOT_KIND = 'root'

function upsertMembership(qc: QueryClient, m: Membership) {
  // My hiding a conversation (architecture.md, Groups): it stays in my list,
  // marked hidden, and nothing else of it stays. Its people do not change.
  const viewer = qc.getQueryData<User | null>(keys.me)
  if (viewer && viewer.id === m.user.id && m.hidden_at != null) {
    qc.setQueryData<Groups>(keys.groups, (old) =>
      old ? { groups: old.groups.map((g) => (g.id === m.group_id ? { ...g, hidden_at: m.hidden_at } : g)) } : old,
    )
    qc.removeQueries({ queryKey: keys.posts(m.group_id) })
    qc.removeQueries({ queryKey: keys.messages(m.group_id) })
    qc.removeQueries({ queryKey: keys.members(m.group_id) })
    dropMarker(qc, `chat:${m.group_id}`)
    dropMarker(qc, `feed:${m.group_id}`)
    return
  }
  qc.setQueryData<Members>(keys.members(m.group_id), (old) => {
    if (!old) return old
    const known = old.members.some((x) => x.user.id === m.user.id)
    return { members: known ? old.members.map((x) => (x.user.id === m.user.id ? m : x)) : [...old.members, m] }
  })
  // The root group's membership is the instance's people list.
  const groups = qc.getQueryData<Groups>(keys.groups)
  const isRoot = groups?.groups.some((g) => g.id === m.group_id && g.kind === ROOT_KIND) ?? isRootID(m.group_id)
  if (isRoot) {
    qc.setQueryData<Users>(keys.users, (old) => {
      if (!old) return old
      const known = old.users.some((x) => x.id === m.user.id)
      const asMember: Member = { ...m.user, role: m.role, joined_at: m.joined_at, can: { remove: false } }
      return {
        users: known
          ? old.users.map((x) => (x.id === m.user.id ? { ...x, ...m.user, role: m.role, joined_at: m.joined_at } : x))
          : [...old.users, asMember],
      }
    })
    // Who may remove whom is the server's call per viewer, and a role change moves it: refetch.
    void qc.invalidateQueries({ queryKey: keys.users })
  }
  // My own role in a group moved every can flag in it; the server recomputes them on refetch.
  const me = qc.getQueryData<User | null>(keys.me)
  if (me && me.id === m.user.id) {
    // A place of mine, new or back: it has a chat marker now.
    void qc.invalidateQueries({ queryKey: keys.markers })
    void qc.invalidateQueries({ queryKey: keys.groups })
    void qc.invalidateQueries({ queryKey: keys.posts(m.group_id) })
    void qc.invalidateQueries({ queryKey: keys.messages(m.group_id) })
    void qc.invalidateQueries({ queryKey: keys.members(m.group_id) })
    void qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'comments' && inGroup(qc, q.queryKey[1], m.group_id),
    })
  }
}

function deleteMembership(qc: QueryClient, groupId: string, userId: string) {
  const me = qc.getQueryData<User | null>(keys.me)
  const root = isRootID(groupId)
  if (me && me.id === userId) {
    if (root) {
      // Off the instance, removed by staff or by me: signed out, nothing of mine kept here.
      qc.setQueryData<User | null>(keys.me, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      return
    }
    dropGroup(qc, groupId)
    return
  }
  qc.setQueryData<Members>(keys.members(groupId), (old) =>
    old ? { members: old.members.filter((x) => x.user.id !== userId) } : old,
  )
  // The root group's membership is the instance's people list.
  if (root)
    qc.setQueryData<Users>(keys.users, (old) => (old ? { users: old.users.filter((x) => x.id !== userId) } : old))
}

/** Does this thread's post live in this group, as far as the cache knows? */
function inGroup(qc: QueryClient, postId: unknown, groupId: string): boolean {
  const posts = qc.getQueryData<Posts>(keys.posts(groupId))
  return posts?.pages.some((p) => p.posts.some((x) => x.id === postId)) ?? false
}

/** The root group's fixed id, for when the groups list is not loaded yet. */
function isRootID(id: string): boolean {
  return id === ROOT_ID
}

function hasId(data: unknown): data is { id: string; post_id?: unknown; group_id?: unknown } {
  return typeof data === 'object' && data !== null && typeof (data as { id?: unknown }).id === 'string'
}
function isUser(data: unknown): data is User {
  return hasId(data) && typeof (data as User).username === 'string'
}
function isPost(data: unknown): data is Post {
  return (
    hasId(data) &&
    typeof (data as Post).group_id === 'string' &&
    typeof (data as Post).comment_count === 'number' &&
    isUser((data as Post).author)
  )
}
function isComment(data: unknown): data is Comment {
  return (
    hasId(data) &&
    typeof (data as Comment).post_id === 'string' &&
    typeof (data as Comment).group_id === 'string' &&
    isUser((data as Comment).author)
  )
}
function isMessage(data: unknown): data is Message {
  return (
    hasId(data) &&
    typeof (data as Message).group_id === 'string' &&
    typeof (data as Message).body_html === 'string' &&
    isUser((data as Message).author)
  )
}
function isGroup(data: unknown): data is Group {
  return hasId(data) && typeof (data as Group).kind === 'string' && typeof (data as Group).can === 'object'
}
function isMembership(data: unknown): data is Membership {
  const m = data as Membership
  return (
    typeof m === 'object' &&
    m !== null &&
    typeof m.group_id === 'string' &&
    typeof m.role === 'string' &&
    isUser(m.user)
  )
}
function isNotification(data: unknown): data is Notification {
  const n = data as Notification
  return hasId(data) && typeof n.kind === 'string' && typeof n.group_id === 'string' && isUser(n.actor)
}
function isMarker(data: unknown): data is Marker {
  const m = data as Marker
  return (
    typeof m === 'object' &&
    m !== null &&
    typeof m.stream === 'string' &&
    typeof m.read_at === 'number' &&
    typeof m.unread === 'number'
  )
}
function isSettings(data: unknown): data is Settings {
  return typeof data === 'object' && data !== null && typeof (data as Settings).group_creation === 'string'
}
function isMembershipRef(data: unknown): data is { group_id: string; user_id: string } {
  const m = data as { group_id?: unknown; user_id?: unknown }
  return typeof m === 'object' && m !== null && typeof m.group_id === 'string' && typeof m.user_id === 'string'
}
