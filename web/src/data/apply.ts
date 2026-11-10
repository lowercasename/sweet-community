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
  Profile,
  Report,
  CommunityText,
  Settings,
  Topic,
  User,
} from '../api'
import { ROOT_ID, keys } from './keys'

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
  'user',
  'group',
  'group_delete',
  'membership',
  'membership_delete',
  'settings',
  'rules',
  'welcome',
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
  qc.setQueriesData<Posts>(
    { queryKey: ['posts'] },
    (old) => old && { ...old, pages: old.pages.map((pg) => ({ ...pg, posts: pg.posts.map(unfiled) })) },
  )
  qc.setQueriesData<Posts>(
    { queryKey: ['userPosts'] },
    (old) => old && { ...old, pages: old.pages.map((pg) => ({ ...pg, posts: pg.posts.map(unfiled) })) },
  )
  qc.setQueriesData<Post>({ queryKey: ['post'] }, (old) => old && unfiled(old))
  qc.removeQueries({ queryKey: ['posts'], predicate: (q) => q.queryKey[2] === id })
}

function isTopic(v: unknown): v is Topic {
  return hasId(v) && typeof (v as { name?: unknown }).name === 'string'
}

type Posts = InfiniteData<PostPage>
type Notifications = InfiniteData<NotificationPage>
type Markers = { markers: Marker[] }
type Messages = InfiniteData<MessagePage>
type Thread = { comments: Comment[] }
type Users = { users: Member[] }
type Groups = { groups: Group[] }
type Members = { members: Membership[] }

/** Finds a post in any loaded feed, as initial data for the post's page. */
export function findPost(qc: QueryClient, id: string): Post | undefined {
  for (const [, data] of qc.getQueriesData<Posts>({ queryKey: ['posts'] })) {
    const found = data?.pages.flatMap((p) => p.posts).find((p) => p.id === id)
    if (found) return found
  }
  return undefined
}

/** Upserts a post into its author's posts list, if that list is loaded. */
function upsertUserPost(qc: QueryClient, post: Post) {
  qc.setQueryData<Posts>(keys.userPosts(post.author.username), (old) => {
    if (!old) return old
    const known = old.pages.some((p) => p.posts.some((x) => x.id === post.id))
    const pages = known
      ? old.pages.map((p) => ({ ...p, posts: p.posts.map((x) => (x.id === post.id ? post : x)) }))
      : old.pages.map((p, i) => (i === 0 ? { ...p, posts: [post, ...p.posts] } : p))
    return { ...old, pages }
  })
}

function upsertPost(qc: QueryClient, post: Post) {
  upsertUserPost(qc, post)
  // A new post by another user that the viewer has not read counts as unread on the group's feed. An edit is not new.
  const me = qc.getQueryData<User | null>(keys.me)
  if (post.edited_at == null && (!me || me.id !== post.author.id))
    bumpMarker(qc, `feed:${post.group_id}`, post.created_at)
  // The post's page query, if loaded, gets the same post.
  qc.setQueryData<Post>(keys.post(post.id), (old) => (old ? post : old))
  // Update the group's feed and each loaded topic view of it. The post goes
  // into the view of the topic it is filed under and out of every other view.
  for (const [key] of qc.getQueriesData<Posts>({ queryKey: keys.posts(post.group_id) })) {
    const topicId = key[2]
    const belongs = topicId === undefined || topicId === post.topic_id
    qc.setQueryData<Posts>(key, (old) => {
      if (!old) return old
      const known = old.pages.some((p) => p.posts.some((x) => x.id === post.id))
      if (!belongs) {
        return known
          ? { ...old, pages: old.pages.map((p) => ({ ...p, posts: p.posts.filter((x) => x.id !== post.id) })) }
          : old
      }
      const pages = known
        ? old.pages.map((p) => ({ ...p, posts: p.posts.map((x) => (x.id === post.id ? post : x)) }))
        : old.pages.map((p, i) => (i === 0 ? { ...p, posts: [post, ...p.posts] } : p))
      return { ...old, pages }
    })
  }
}

function deletePost(qc: QueryClient, id: string, groupId: string) {
  qc.setQueriesData<Posts>({ queryKey: keys.posts(groupId) }, (old) =>
    old ? { ...old, pages: old.pages.map((p) => ({ ...p, posts: p.posts.filter((x) => x.id !== id) })) } : old,
  )
  qc.removeQueries({ queryKey: keys.comments(id) })
  qc.removeQueries({ queryKey: keys.post(id) })
  qc.setQueriesData<Posts>(
    { queryKey: ['userPosts'] },
    (old) => old && { ...old, pages: old.pages.map((p) => ({ ...p, posts: p.posts.filter((x) => x.id !== id) })) },
  )
}

function countComments(qc: QueryClient, postId: string, groupId: string, by: number) {
  const counted = (x: Post) => ({ ...x, comment_count: Math.max(0, x.comment_count + by) })
  qc.setQueryData<Post>(keys.post(postId), (old) => (old ? counted(old) : old))
  qc.setQueriesData<Posts>(
    { queryKey: ['userPosts'] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((p) => ({ ...p, posts: p.posts.map((x) => (x.id === postId ? counted(x) : x)) })),
      },
  )
  qc.setQueriesData<Posts>({ queryKey: keys.posts(groupId) }, (old) =>
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
  // A new comment increments its post's comment count. An edit or a replay does not.
  if (!known && c.edited_at == null) countComments(qc, c.post_id, c.group_id, 1)
}

function deleteComment(qc: QueryClient, id: string, postId: string, groupId: string) {
  const thread = qc.getQueryData<Thread>(keys.comments(postId))
  const known = thread?.comments.some((x) => x.id === id) ?? true
  if (thread) qc.setQueryData<Thread>(keys.comments(postId), { comments: thread.comments.filter((x) => x.id !== id) })
  if (known) countComments(qc, postId, groupId, -1)
}

function upsertMessage(qc: QueryClient, m: Message) {
  // A message by another user that the viewer has not read counts as unread on the group.
  // A joined or added line does not, and it does not move the group's newest message time.
  const me = qc.getQueryData<User | null>(keys.me)
  if (m.kind === 'message' && (!me || me.id !== m.author.id)) bumpMarker(qc, `chat:${m.group_id}`, m.created_at)
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
  // The message goes, and each reply to it shows only that it replied to a deleted message, as the server's
  // snippet does once the original is deleted.
  const gone = (m: Message): Message =>
    m.reply_to?.id === id ? { ...m, reply_to: { id, author: null, text: '', deleted: true } } : m
  qc.setQueryData<Messages>(keys.messages(groupId), (old) =>
    old
      ? { ...old, pages: old.pages.map((p) => ({ ...p, messages: p.messages.filter((x) => x.id !== id).map(gone) })) }
      : old,
  )
}

/** A user changed, for example their picture or their name. Updates every copy of the user in the cache. */
function upsertUser(qc: QueryClient, u: User) {
  qc.setQueryData<Users>(keys.users, (old) =>
    old ? { users: old.users.map((x) => (x.id === u.id ? { ...x, ...u } : x)) } : old,
  )
  const me = qc.getQueryData<User | null>(keys.me)
  if (me && me.id === u.id) qc.setQueryData<User>(keys.me, { ...me, ...u })
  // Update the author snapshots in every loaded feed, thread and chat too, so
  // a renamed or removed user is shown correctly at once, whether or not they
  // are still in the users list.
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
  qc.setQueriesData<Posts>(
    { queryKey: ['userPosts'] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((p) => ({ ...p, posts: p.posts.map((x) => ({ ...x, author: as(x.author) })) })),
      },
  )
  // Profile pages are refetched. A renamed user's profile is at a new path.
  void qc.invalidateQueries({ queryKey: ['profile'] })
  qc.setQueriesData<Thread>(
    { queryKey: ['comments'] },
    (old) => old && { comments: old.comments.map((c) => ({ ...c, author: as(c.author) })) },
  )
  qc.setQueriesData<Messages>(
    { queryKey: ['messages'] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((p) => ({
          ...p,
          messages: p.messages.map((m) => ({
            ...m,
            author: as(m.author),
            reply_to: m.reply_to?.author ? { ...m.reply_to, author: as(m.reply_to.author) } : m.reply_to,
          })),
        })),
      },
  )
}

/** Adjusts a stream's unread count by the number of notifications opened or received. */
function countUnread(qc: QueryClient, stream: string, by: number) {
  qc.setQueryData<Markers>(keys.markers, (old) =>
    old
      ? { markers: old.markers.map((x) => (x.stream === stream ? { ...x, unread: Math.max(0, x.unread + by) } : x)) }
      : old,
  )
}

/**
 * Increments a stream's unread count for a new item newer than the read marker. A replay after a reconnect refetches
 * the markers anyway.
 */
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

/**
 * Upserts a notification. A new one goes to the top of the list once, and
 * increments the notifications stream's unread count while it is unopened.
 * When it is opened (the same event with read_at set), the count is
 * decremented. The count is computed from the loaded list. When the list is
 * not loaded, a new unopened notification increments the count, and a
 * reconnect refetches it.
 */
function upsertNotification(qc: QueryClient, n: Notification) {
  const list = qc.getQueryData<Notifications>(keys.notifications)
  const was = list?.pages.flatMap((p) => p.notifications).find((x) => x.id === n.id)
  const unread = (x: Notification | undefined) => x !== undefined && x.read_at == null
  const by = (unread(n) ? 1 : 0) - (was ? (unread(was) ? 1 : 0) : 0)
  if (by !== 0) countUnread(qc, 'notifications', by)
  qc.setQueryData<Notifications>(keys.notifications, (old) => {
    if (!old) return old
    const known = old.pages.some((p) => p.notifications.some((x) => x.id === n.id))
    const pages = known
      ? old.pages.map((p) => ({ ...p, notifications: p.notifications.map((x) => (x.id === n.id ? n : x)) }))
      : old.pages.map((p, i) => (i === 0 ? { ...p, notifications: [n, ...p.notifications] } : p))
    return { ...old, pages }
  })
}

/** Removes the opened notifications created before a time. Unopened notifications stay. */
function clearNotifications(qc: QueryClient, before: number) {
  qc.setQueryData<Notifications>(keys.notifications, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            notifications: p.notifications.filter((n) => n.read_at == null || n.created_at > before),
          })),
        }
      : old,
  )
}

/**
 * Upserts a read marker, which is the time the user has read a stream up to and the unread count past it. The
 * marker only moves forward, as on the server, so a stale tab's marker changes nothing.
 */
function upsertMarker(qc: QueryClient, m: Marker) {
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

/** Removes everything about a group from the cache, when the group is deleted or the user leaves it. */
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
    return
  }
  qc.setQueryData<Members>(keys.members(groupId), (old) =>
    old ? { members: old.members.filter((x) => x.user.id !== userId) } : old,
  )
  // The root group's members are the instance's users list.
  if (root)
    qc.setQueryData<Users>(keys.users, (old) => (old ? { users: old.users.filter((x) => x.id !== userId) } : old))
}

/** Whether the post with this id is in this group's loaded feed. */
function inGroup(qc: QueryClient, postId: unknown, groupId: string): boolean {
  const posts = qc.getQueryData<Posts>(keys.posts(groupId))
  return posts?.pages.some((p) => p.posts.some((x) => x.id === postId)) ?? false
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
  return hasId(data) && typeof n.kind === 'string' && typeof n.group_id === 'string' && isUser(n.actor)
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
