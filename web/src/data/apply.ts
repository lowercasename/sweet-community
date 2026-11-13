import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type {
  MySettings,
  PostNotificationPreference,
  RoomNotificationPreference,
  Comment,
  CommentPage,
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
  Profile,
  Reaction,
  Reactions,
  Report,
  CommunityText,
  Settings,
  Topic,
  User,
} from '../api'
import { dismissDeviceNotifications } from '../reading'
import { ROOT_ID, keys } from './keys'
import { postStream, type Markers } from './notifications'

/**
 * The kinds of event the stream listens for: the whole resource, or its deletion. The
 * browser drops an event whose kind is not listed, so every kind applyEvent handles must be here. A test checks this.
 */
export const EVENT_KINDS = [
  'post',
  'post_delete',
  'comment',
  'comment_delete',
  'message',
  'message_delete',
  'reactions',
  'user',
  'group',
  'group_delete',
  'membership',
  'membership_delete',
  'settings',
  'rules',
  'welcome',
  'my_settings',
  'post_notification_preference',
  'room_notification_preference',
  'notification',
  'notification_delete',
  'marker',
  'profile',
  'topic',
  'topic_delete',
  'report',
  'report_delete',
] as const

/**
 * The cache's one write path. Every event from the stream, and every reply
 * to one of our own writes, goes through this function. Each resource has an
 * upsert and a delete. Both are idempotent, so a replay changes nothing.
 * Queries that are not loaded are left alone. They fetch fresh data when they
 * are next used. The server has already decided what this viewer may see.
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
    case 'reactions':
      if (isReactions(data)) setReactions(qc, data)
      break
    case 'user':
      if (isUser(data)) upsertUser(qc, data)
      break
    case 'group':
      if (isGroup(data)) upsertGroup(qc, data)
      break
    case 'group_delete':
      if (hasId(data)) {
        dropGroup(qc, data.id)
        dropNotifications(qc, data.id)
      }
      break
    case 'membership':
      if (isMembership(data)) upsertMembership(qc, data)
      break
    case 'membership_delete':
      if (isMembershipRef(data)) deleteMembership(qc, data.group_id, data.user_id)
      break
    case 'my_settings':
      qc.setQueryData(keys.mySettings, data as MySettings)
      break
    case 'post_notification_preference': {
      const preference = data as PostNotificationPreference
      qc.setQueryData(keys.postNotifications(preference.post_id), preference)
      // A muted discussion has no unread comments, so the post's marker changes.
      void qc.invalidateQueries({ queryKey: keys.markers })
      break
    }
    case 'room_notification_preference': {
      const preference = data as RoomNotificationPreference
      qc.setQueryData(keys.roomNotifications(preference.group_id), preference)
      break
    }
    case 'notification':
      if (isNotification(data)) upsertNotification(qc, data)
      break
    case 'notification_delete':
      if (isCleared(data)) clearNotifications(qc, data.before)
      break
    case 'marker':
      if (isMarker(data)) upsertMarker(qc, data)
      break
    case 'profile':
      if (isProfile(data)) qc.setQueryData<Profile>(keys.profile(data.username), data)
      break
    case 'rules':
    case 'welcome':
      if (typeof data === 'object' && data !== null && typeof (data as CommunityText).body_html === 'string') {
        qc.setQueryData<CommunityText>(keys[kind], data as CommunityText)
      }
      break
    case 'settings':
      if (isSettings(data)) {
        qc.setQueryData<Settings>(keys.settings, data)
        // The root group carries the group_creation setting as a can flag, computed per viewer on the server.
        void qc.invalidateQueries({ queryKey: keys.groups })
      }
      break
    case 'topic':
      if (isTopic(data)) upsertTopic(qc, data)
      break
    case 'topic_delete':
      if (hasId(data)) deleteTopic(qc, data.id)
      break
    case 'report':
      if (isReport(data)) upsertReport(qc, data)
      break
    case 'report_delete':
      if (isClosedReport(data)) dropReport(qc, data.kind, data.id)
      break
  }
}

type Reports = { reports: Report[] }

/** A report event comes from a new report, so its item moves to the top, where the newest report is. */
function upsertReport(qc: QueryClient, r: Report) {
  qc.setQueryData<Reports>(keys.reports, (old) =>
    old ? { reports: [r, ...old.reports.filter((x) => x.kind !== r.kind || x.id !== r.id)] } : old,
  )
}

function dropReport(qc: QueryClient, kind: string, id: string) {
  qc.setQueryData<Reports>(keys.reports, (old) =>
    old ? { reports: old.reports.filter((x) => x.kind !== kind || x.id !== id) } : old,
  )
}

type Topics = { topics: Topic[] }

/**
 * A topic event from the stream does not say whether the user follows the
 * topic, so the cached `following` value is kept. The reply to the user's own
 * follow or unfollow does carry it, and is applied through `applyFollowing`.
 */
function upsertTopic(qc: QueryClient, t: Topic, following?: boolean) {
  qc.setQueryData<Topics>(keys.topics, (old) => {
    const known = old?.topics.find((x) => x.id === t.id)
    const next = { ...t, following: following ?? known?.following ?? false }
    const rest = (old?.topics ?? []).filter((x) => x.id !== t.id)
    return { topics: [...rest, next].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) }
  })
}

/** Applies the server's reply to the user's own follow or unfollow, which is the topic as the user now sees it. */
export function applyFollowing(qc: QueryClient, t: Topic) {
  upsertTopic(qc, t, t.following)
}

/** Removes a deleted topic from the list and clears topic_id on the posts that had it. */
function deleteTopic(qc: QueryClient, id: string) {
  qc.setQueryData<Topics>(keys.topics, (old) => old && { topics: old.topics.filter((x) => x.id !== id) })
  const unfiled = (p: Post) => (p.topic_id === id ? { ...p, topic_id: null } : p)
  qc.setQueriesData<Posts>({ queryKey: ['posts'] }, (old) => eachPage(old, 'posts', (ps) => ps.map(unfiled)))
  qc.setQueriesData<Posts>({ queryKey: ['userPosts'] }, (old) => eachPage(old, 'posts', (ps) => ps.map(unfiled)))
  qc.setQueriesData<Post>({ queryKey: ['post'] }, (old) => old && unfiled(old))
  qc.removeQueries({ queryKey: ['posts'], predicate: (q) => q.queryKey[2] === id })
}

function isTopic(v: unknown): v is Topic {
  return hasId(v) && typeof (v as { name?: unknown }).name === 'string'
}

type Posts = InfiniteData<PostPage>
type Notifications = InfiniteData<NotificationPage>
type Messages = InfiniteData<MessagePage>
type Thread = InfiniteData<CommentPage>
type Users = { users: Member[] }
type Groups = { groups: Group[] }
type Members = { members: Membership[] }

/** Changes the items of each page of a paged list, under `key`, such as a page's posts. */
function eachPage<K extends string, P extends Record<K, unknown[]>>(
  old: InfiniteData<P> | undefined,
  key: K,
  change: (items: P[K]) => P[K],
): InfiniteData<P> | undefined {
  return old && { ...old, pages: old.pages.map((p) => ({ ...p, [key]: change(p[key]) })) }
}

/** Whether a paged list holds an item. */
function holds<K extends string, P extends Record<K, { id: string }[]>>(
  old: InfiniteData<P> | undefined,
  key: K,
  id: string,
): boolean {
  return old?.pages.some((p) => p[key].some((x) => x.id === id)) ?? false
}

/**
 * Replaces an item in a paged list, or puts a new one first in the newest page. An item older than every loaded item
 * is left out while earlier pages are not loaded, because it belongs on one of those pages. That is an edit of an old
 * post or comment, or an old notification marked read.
 */
function upsertInPages<
  K extends string,
  P extends Record<K, { id: string; created_at: number }[]> & { next_before: string | null },
>(old: InfiniteData<P> | undefined, key: K, item: P[K][number]): InfiniteData<P> | undefined {
  if (!old) return old
  if (holds(old, key, item.id))
    return eachPage(old, key, (items) => items.map((x) => (x.id === item.id ? item : x)) as P[K])
  const loaded = old.pages.flatMap((p) => p[key])
  const more = old.pages[old.pages.length - 1]?.next_before != null
  if (more && loaded.length > 0 && loaded.every((x) => x.created_at > item.created_at)) return old
  return { ...old, pages: old.pages.map((p, i) => (i === 0 ? { ...p, [key]: [item, ...p[key]] } : p)) }
}

/** Upserts a post into its author's posts list, if that list is loaded. */
function upsertUserPost(qc: QueryClient, post: Post) {
  qc.setQueryData<Posts>(keys.userPosts(post.author.username), (old) => upsertInPages(old, 'posts', post))
}

function upsertPost(qc: QueryClient, post: Post) {
  upsertUserPost(qc, post)
  void qc.invalidateQueries({ queryKey: keys.markers })
  // The post's page query, if loaded, gets the same post.
  qc.setQueryData<Post>(keys.post(post.id), (old) => (old ? post : old))
  // Update the group's feed and each loaded topic view of it. The post goes
  // into the view of the topic it is filed under and out of every other view.
  for (const [key] of qc.getQueriesData<Posts>({ queryKey: keys.posts(post.group_id) })) {
    const topicId = key[2]
    const belongs = topicId === undefined || topicId === post.topic_id
    qc.setQueryData<Posts>(key, (old) =>
      belongs ? upsertInPages(old, 'posts', post) : eachPage(old, 'posts', (ps) => ps.filter((x) => x.id !== post.id)),
    )
  }
}

function deletePost(qc: QueryClient, id: string, groupId: string) {
  void qc.invalidateQueries({ queryKey: keys.markers })
  const without = (old: Posts | undefined) => eachPage(old, 'posts', (ps) => ps.filter((x) => x.id !== id))
  qc.setQueriesData<Posts>({ queryKey: keys.posts(groupId) }, without)
  qc.removeQueries({ queryKey: keys.comments(id) })
  qc.removeQueries({ queryKey: keys.post(id) })
  qc.setQueriesData<Posts>({ queryKey: ['userPosts'] }, without)
}

/** Puts an item's new reactions on every loaded copy of the item. */
function setReactions(qc: QueryClient, r: Reactions) {
  const set = <T extends { id: string; reactions: Reaction[] }>(items: T[]) =>
    items.map((x) => (x.id === r.id ? { ...x, reactions: r.reactions } : x))
  if (r.kind === 'post') {
    qc.setQueriesData<Posts>({ queryKey: keys.posts(r.group_id) }, (old) => eachPage(old, 'posts', set))
    qc.setQueriesData<Posts>({ queryKey: ['userPosts'] }, (old) => eachPage(old, 'posts', set))
    qc.setQueryData<Post>(keys.post(r.id), (old) => old && { ...old, reactions: r.reactions })
  } else if (r.kind === 'comment' && r.post_id) {
    qc.setQueryData<Thread>(keys.comments(r.post_id), (old) => eachPage(old, 'comments', set))
  } else if (r.kind === 'message') {
    qc.setQueryData<Messages>(keys.messages(r.group_id), (old) => eachPage(old, 'messages', set))
  }
}

/** Refetches the server's comment count everywhere the post is shown. */
function refreshCommentCount(qc: QueryClient, postId: string, groupId: string) {
  // The user's unread comments on the post are counted in their marker for it, if they have one.
  if (qc.getQueryData<Markers>(keys.markers)?.markers.some((m) => m.stream === postStream(postId)))
    void qc.invalidateQueries({ queryKey: keys.markers })
  void qc.invalidateQueries({ queryKey: keys.post(postId) })
  void qc.invalidateQueries({ queryKey: keys.posts(groupId) })
  void qc.invalidateQueries({ queryKey: ['userPosts'] })
}

function upsertComment(qc: QueryClient, c: Comment) {
  void qc.invalidateQueries({ queryKey: keys.postNotifications(c.post_id) })
  qc.setQueryData<Thread>(keys.comments(c.post_id), (old) => upsertInPages(old, 'comments', c))
  refreshCommentCount(qc, c.post_id, c.group_id)
}

function deleteComment(qc: QueryClient, id: string, postId: string, groupId: string) {
  qc.setQueryData<Thread>(keys.comments(postId), (old) =>
    eachPage(old, 'comments', (cs) => cs.filter((x) => x.id !== id)),
  )
  refreshCommentCount(qc, postId, groupId)
}

function upsertMessage(qc: QueryClient, m: Message) {
  if (m.kind === 'message') void qc.invalidateQueries({ queryKey: keys.markers })
  // The group's newest message time orders the Conversations page. A replay never moves it backwards.
  if (m.kind === 'message')
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
  qc.setQueryData<Messages>(keys.messages(m.group_id), (old) => upsertInPages(old, 'messages', m))
}

function deleteMessage(qc: QueryClient, id: string, groupId: string) {
  void qc.invalidateQueries({ queryKey: keys.markers })
  // The message goes, and each reply to it shows only that it replied to a deleted message, as the server's
  // snippet does once the original is deleted.
  const gone = (m: Message): Message =>
    m.reply_to?.id === id ? { ...m, reply_to: { id, author: null, text: '', deleted: true } } : m
  qc.setQueryData<Messages>(keys.messages(groupId), (old) =>
    eachPage(old, 'messages', (ms) => ms.filter((x) => x.id !== id).map(gone)),
  )
}

/** Queries whose responses include user identities. */
const identityQueries = new Set([
  'users',
  'groups',
  'members',
  'posts',
  'post',
  'userPosts',
  'comments',
  'messages',
  'notifications',
  'profile',
  'search',
  'reports',
  'invites',
])

/** Refreshes open views in place. Closed views and failed refreshes retain no identity data. */
export function refreshIdentities(qc: QueryClient, includeMe = false) {
  for (const query of qc.getQueryCache().findAll({
    predicate: (q) => identityQueries.has(String(q.queryKey[0])) || (includeMe && q.queryKey[0] === 'me'),
  })) {
    if (!query.isActive()) {
      query.reset()
      continue
    }
    // Explicit cancellation also replaces an initial request that has no cached data yet.
    void query.cancel({ silent: true })
    // Observe the whole fetch because a retry can pause after the first attempt fails.
    const stop = qc.getQueryCache().subscribe((event) => {
      if (event.query !== query || event.type !== 'updated' || query.state.data === undefined) return
      const paused = query.state.fetchStatus === 'paused'
      if (query.state.status === 'error' || paused) {
        query.setState({ data: undefined, dataUpdatedAt: 0, ...(paused ? { status: 'pending' } : {}) })
      }
    })
    void query
      .fetch()
      .catch(() => {})
      .finally(stop)
  }
}

function upsertUser(qc: QueryClient, u: User) {
  const me = qc.getQueryData<User | null>(keys.me)
  if (me?.id === u.id) {
    void qc.cancelQueries({ queryKey: keys.me })
    qc.setQueryData<User>(keys.me, u)
  }
  refreshIdentities(qc)
}

/** Upserts the notification and refreshes the server's unread count. */
function upsertNotification(qc: QueryClient, n: Notification) {
  const current = qc
    .getQueryData<Notifications>(keys.notifications)
    ?.pages.flatMap((p) => p.notifications)
    .find((old) => old.id === n.id)
  if (
    current &&
    ((current.activity_count ?? 1) > (n.activity_count ?? 1) ||
      ((current.activity_count ?? 1) === (n.activity_count ?? 1) && current.read_at !== null && n.read_at === null))
  )
    return
  if (n.read_at != null) dismissDeviceNotifications(n.created_at, n.scope ?? '', n.id, n.activity_count ?? 1)
  // New activity gives a discussion's notification a later time, so it moves to the top of the list.
  const moved = current !== undefined && current.created_at !== n.created_at
  qc.setQueryData<Notifications>(keys.notifications, (old) =>
    upsertInPages(
      moved ? eachPage(old, 'notifications', (ns) => ns.filter((x) => x.id !== n.id)) : old,
      'notifications',
      n,
    ),
  )
  void qc.invalidateQueries({ queryKey: keys.markers })
}

/** Removes read and unread notifications through the server cutoff. */
function clearNotifications(qc: QueryClient, before: number) {
  dismissDeviceNotifications(before)
  void qc.invalidateQueries({ queryKey: keys.markers })
  qc.setQueryData<Notifications>(keys.notifications, (old) =>
    eachPage(old, 'notifications', (ns) => ns.filter((n) => n.created_at > before)),
  )
}

/**
 * Upserts a read marker, which is the time the user has read a stream up to and the unread count past it. The
 * marker only moves forward, as on the server, so a stale tab's marker changes nothing.
 */
function upsertMarker(qc: QueryClient, m: Marker) {
  if (m.stream !== 'notifications') dismissDeviceNotifications(m.read_at, m.stream)
  qc.setQueryData<Markers>(keys.markers, (old) => {
    const markers = old?.markers ?? []
    const known = markers.some((x) => x.stream === m.stream)
    return {
      markers: known ? markers.map((x) => (x.stream === m.stream && x.read_at <= m.read_at ? m : x)) : [...markers, m],
    }
  })
}

/** Removes the marker of a stream the user no longer has. */
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
  // A new group of the user's has a chat marker, so refetch the markers.
  if (!known) void qc.invalidateQueries({ queryKey: keys.markers })
}

/**
 * Removes a group from the cache when it is deleted or the user leaves it. Its lists, its posts in every list and its
 * markers are removed.
 */
function dropGroup(qc: QueryClient, id: string) {
  qc.setQueryData<Groups>(keys.groups, (old) => (old ? { groups: old.groups.filter((x) => x.id !== id) } : old))
  qc.removeQueries({ queryKey: keys.posts(id) })
  qc.removeQueries({ queryKey: keys.messages(id) })
  qc.removeQueries({ queryKey: keys.members(id) })
  qc.removeQueries({
    predicate: (q) => q.queryKey[0] === 'post' && (q.state.data as Post | undefined)?.group_id === id,
  })
  qc.setQueriesData<Posts>({ queryKey: ['userPosts'] }, (old) =>
    eachPage(old, 'posts', (ps) => ps.filter((x) => x.group_id !== id)),
  )
  dropMarker(qc, `chat:${id}`)
  dropMarker(qc, `feed:${id}`)
}

/**
 * Removes a deleted group's notifications, which the server deleted with the group. Their unread count may have
 * changed, so the markers are fetched again.
 */
function dropNotifications(qc: QueryClient, groupId: string) {
  qc.setQueryData<Notifications>(keys.notifications, (old) =>
    eachPage(old, 'notifications', (ns) => ns.filter((n) => n.group_id !== groupId)),
  )
  void qc.invalidateQueries({ queryKey: keys.markers })
}

const ROOT_KIND = 'root'

function upsertMembership(qc: QueryClient, m: Membership) {
  // The user hid a conversation. The conversation
  // stays in the groups list marked hidden, and everything else about it is
  // removed. Its members do not change.
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
  // The root group's members are the instance's users list.
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
    // The server computes who may remove whom per viewer, and a role change affects it, so refetch.
    void qc.invalidateQueries({ queryKey: keys.users })
  }
  const me = qc.getQueryData<User | null>(keys.me)
  if (me && me.id === m.user.id) refetchForOwnRole(qc, m.group_id)
}

/**
 * Refetches what the client holds for a group after the user's own membership in it changed. A change to the
 * user's role changes every can flag in the group, and the server recomputes them on refetch. A user who joined
 * or rejoined the group now has a chat marker for it.
 */
export function refetchForOwnRole(qc: QueryClient, groupId: string) {
  void qc.invalidateQueries({ queryKey: keys.markers })
  void qc.invalidateQueries({ queryKey: keys.groups })
  void qc.invalidateQueries({ queryKey: keys.posts(groupId) })
  void qc.invalidateQueries({ queryKey: keys.messages(groupId) })
  void qc.invalidateQueries({ queryKey: keys.members(groupId) })
  void qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'comments' && inGroup(qc, q.queryKey[1], groupId),
  })
}

/**
 * Signs the page out: the user becomes nobody and every other query is removed, so the sign-in page shows and no
 * content stays in memory. Used when the user is removed from the instance and when the server ends the event stream
 * because the session has ended.
 */
export function signedOut(qc: QueryClient) {
  qc.setQueryData<User | null>(keys.me, null)
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
}

function deleteMembership(qc: QueryClient, groupId: string, userId: string) {
  const me = qc.getQueryData<User | null>(keys.me)
  const root = isRootID(groupId)
  if (me && me.id === userId) {
    if (root) {
      // The user was removed from the instance, by staff or by themselves.
      signedOut(qc)
      return
    }
    dropGroup(qc, groupId)
    // Room deletion also removes memberships. Refetch because deletion clears notifications but leaving keeps them.
    void qc.invalidateQueries({ queryKey: keys.notifications })
    void qc.invalidateQueries({ queryKey: keys.markers })
    return
  }
  qc.setQueryData<Members>(keys.members(groupId), (old) =>
    old ? { members: old.members.filter((x) => x.user.id !== userId) } : old,
  )
  // Removal also arrives through the HTTP response, without waiting for the user event.
  if (root) void qc.resetQueries({ predicate: (q) => identityQueries.has(String(q.queryKey[0])) })
}

/** Whether the post with this id is in this group's loaded feed. */
function inGroup(qc: QueryClient, postId: unknown, groupId: string): boolean {
  return typeof postId === 'string' && holds(qc.getQueryData<Posts>(keys.posts(groupId)), 'posts', postId)
}

/** Whether the id is the root group's fixed id. Used when the groups list is not loaded yet. */
function isRootID(id: string): boolean {
  return id === ROOT_ID
}

function hasId(data: unknown): data is { id: string; post_id?: unknown; group_id?: unknown } {
  return typeof data === 'object' && data !== null && typeof (data as { id?: unknown }).id === 'string'
}
function isUser(data: unknown): data is User {
  return hasId(data) && typeof (data as User).username === 'string'
}
function isReactions(data: unknown): data is Reactions {
  const r = data as Reactions
  return (
    hasId(data) &&
    (r.kind === 'post' || r.kind === 'comment' || r.kind === 'message') &&
    typeof r.group_id === 'string' &&
    Array.isArray(r.reactions)
  )
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
function isClosedReport(data: unknown): data is { kind: string; id: string } {
  return hasId(data) && typeof (data as { kind?: unknown }).kind === 'string'
}
function isReport(data: unknown): data is Report {
  const r = data as Report
  return hasId(data) && typeof r.kind === 'string' && Array.isArray(r.reports) && isUser(r.author)
}
function isNotification(data: unknown): data is Notification {
  const n = data as Notification
  return (
    hasId(data) &&
    typeof n.kind === 'string' &&
    typeof n.group_id === 'string' &&
    (n.kind === 'report' ? n.actor === null : isUser(n.actor))
  )
}
function isCleared(data: unknown): data is { before: number } {
  return typeof data === 'object' && data !== null && typeof (data as { before?: unknown }).before === 'number'
}
function isProfile(data: unknown): data is Profile {
  const p = data as Profile
  return isUser(data) && typeof p.role === 'string' && typeof p.bio_html === 'string'
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
