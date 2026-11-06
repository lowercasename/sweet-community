import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  addMember,
  clearNotifications,
  createComment,
  readNotification,
  createGroup,
  createInvite,
  createMessage,
  createPost,
  deleteComment,
  deleteGroup,
  deleteMessage,
  deletePost,
  getComments,
  getMe,
  getMessages,
  getPost,
  getPosts,
  getProfile,
  getUserPosts,
  getSettings,
  listGroups,
  listInvites,
  listMarkers,
  listMembers,
  listNotifications,
  listUsers,
  logout,
  openDM,
  removeMember,
  removeUser,
  revokeInvite,
  setBio,
  setGroupPicture,
  setMarker,
  setMemberRole,
  setPicture,
  setSettings,
  updateComment,
  updateGroup,
  updatePost,
  type Group,
  type GroupMode,
  type Invite,
  type Member,
  type Notification,
  type Role,
  type Settings,
  type User,
} from '../api'
import { applyEvent, findPost } from './apply'
import { ROOT_ID, keys } from './keys'
import { NOTIFICATIONS, unreadPlaces, type UnreadPlace } from './notifications'

/*
 * Reads are queries; writes call the API and then feed the reply through
 * applyEvent, the same path the stream uses, so the cache never has two
 * ways of changing. Components keep no server data of their own.
 */

/** The signed-in user, or null when nobody is. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () =>
      getMe().catch((e: unknown) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
  })
}

export function useSession() {
  const qc = useQueryClient()
  return {
    signIn(me: User) {
      qc.setQueryData<User | null>(keys.me, me)
    },
    async signOut() {
      await logout()
      // "Me" first, so the observer that renders the app learns it; then the
      // rest. Clearing the whole cache first would leave that observer holding
      // the removed query and its old answer.
      qc.setQueryData<User | null>(keys.me, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    },
    /** Off the instance (my account removed): the session is already gone on the server; nothing of mine stays here. */
    gone() {
      qc.setQueryData<User | null>(keys.me, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    },
  }
}

/** Removing someone from the instance (architecture.md, Admin tools): staff from People, anyone themselves from Settings. */
export function useRemoveUser() {
  const qc = useQueryClient()
  return async (userId: string) => {
    await removeUser(userId)
    applyEvent(qc, 'membership_delete', { group_id: ROOT_ID, user_id: userId })
  }
}

const byId = (r: { users: Member[] }) => new Map(r.users.map((u) => [u.id, u]))

/** Everyone on the instance, by id. */
export function useUsers() {
  return useQuery({ queryKey: keys.users, queryFn: listUsers, select: byId })
}

/** A person as they are now: the users cache first, the snapshot that came with the content as fallback. */
export function useAuthor(author: User): User {
  const { data: users } = useUsers()
  return users?.get(author.id) ?? author
}

/** The groups I am in, the root first. */
export function useGroups() {
  const q = useQuery({ queryKey: keys.groups, queryFn: listGroups })
  return { groups: q.data?.groups ?? [], loading: q.isPending, error: q.error }
}

/** The instance itself, as a group. Undefined until the groups are loaded. */
export function useRootGroup(): Group | undefined {
  return useGroups().groups.find((g) => g.kind === 'root')
}

export function usePosts(groupId: string) {
  const q = useInfiniteQuery({
    queryKey: keys.posts(groupId),
    queryFn: ({ pageParam }) => getPosts(groupId, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before,
  })
  const seen = new Set<string>()
  const posts = (q.data?.pages ?? [])
    .flatMap((p) => p.posts)
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => b.created_at - a.created_at)
  return {
    posts,
    loading: q.isPending || q.isFetchingNextPage,
    error: q.error,
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
  }
}

/**
 * One post, for its page. A loaded feed's copy is the starting point, so a
 * post opened from the feed draws at once; the server's is fetched behind
 * it. applyEvent keeps this query in step with the feed from then on.
 */
export function usePost(id: string, enabled = true) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: keys.post(id),
    queryFn: () => getPost(id),
    initialData: () => findPost(qc, id),
    initialDataUpdatedAt: 0,
    enabled,
    // Not here is an answer, not a hiccup: no second try.
    retry: (n, e) => n < 1 && !(e instanceof ApiError && e.status === 404),
  })
  return { post: q.data, loading: q.isPending, error: q.error }
}

export function usePostActions(groupId: string) {
  const qc = useQueryClient()
  return {
    async create(html: string) {
      applyEvent(qc, 'post', await createPost(groupId, html))
    },
    async edit(id: string, html: string) {
      applyEvent(qc, 'post', await updatePost(id, html))
    },
    async remove(id: string) {
      await deletePost(id)
      applyEvent(qc, 'post_delete', { id, group_id: groupId })
    },
  }
}

export function useComments(postId: string) {
  const q = useQuery({ queryKey: keys.comments(postId), queryFn: () => getComments(postId) })
  return { comments: q.data?.comments ?? [], loading: q.isPending, error: q.error }
}

export function useCommentActions(postId: string, groupId: string) {
  const qc = useQueryClient()
  return {
    async create(html: string) {
      applyEvent(qc, 'comment', await createComment(postId, html))
    },
    async edit(id: string, html: string) {
      applyEvent(qc, 'comment', await updateComment(id, html))
    },
    async remove(id: string) {
      await deleteComment(id)
      applyEvent(qc, 'comment_delete', { id, post_id: postId, group_id: groupId })
    },
  }
}

/** A room, oldest first. Pages arrive newest first and older ones are fetched backwards. */
export function useMessages(groupId: string) {
  const q = useInfiniteQuery({
    queryKey: keys.messages(groupId),
    queryFn: ({ pageParam }) => getMessages(groupId, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before,
  })
  const seen = new Set<string>()
  const messages = (q.data?.pages ?? [])
    .flatMap((p) => p.messages)
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => a.created_at - b.created_at)
  return {
    messages,
    loading: q.isPending || q.isFetchingNextPage,
    error: q.error,
    hasEarlier: q.hasNextPage,
    loadEarlier: () => q.fetchNextPage(),
  }
}

export function useMessageActions(groupId: string) {
  const qc = useQueryClient()
  return {
    async send(html: string) {
      applyEvent(qc, 'message', await createMessage(groupId, html))
    },
    async remove(id: string) {
      await deleteMessage(id)
      applyEvent(qc, 'message_delete', { id, group_id: groupId })
    },
  }
}

export function useInvites(enabled: boolean) {
  const q = useQuery({ queryKey: keys.invites, queryFn: listInvites, enabled })
  return { invites: q.data?.invites ?? [], error: q.error }
}

export function useInviteActions() {
  const qc = useQueryClient()
  return {
    async create() {
      const inv = await createInvite()
      qc.setQueryData<{ invites: Invite[] }>(keys.invites, (old) => ({ invites: [inv, ...(old?.invites ?? [])] }))
    },
    async revoke(code: string) {
      await revokeInvite(code)
      qc.setQueryData<{ invites: Invite[] }>(keys.invites, (old) => ({
        invites: (old?.invites ?? []).filter((i) => i.code !== code),
      }))
    },
  }
}

/** The owner sets member or moderator, or hands the group over with role owner. */
export function useSetRole(groupId: string) {
  const qc = useQueryClient()
  return async (userId: string, role: Role) => {
    applyEvent(qc, 'membership', await setMemberRole(groupId, userId, role))
    // Handing over changed my own membership too; the server logged both, and the stream will bring mine.
    if (role === 'owner') void qc.invalidateQueries({ queryKey: keys.groups })
  }
}

export function useMembers(groupId: string) {
  const q = useQuery({ queryKey: keys.members(groupId), queryFn: () => listMembers(groupId) })
  return { members: q.data?.members ?? [], loading: q.isPending, error: q.error }
}

export function useGroupActions() {
  const qc = useQueryClient()
  return {
    async create(name: string, mode: GroupMode): Promise<Group> {
      const g = await createGroup(name, mode)
      applyEvent(qc, 'group', g)
      return g
    },
    async update(groupId: string, patch: { name?: string; mode?: GroupMode }) {
      applyEvent(qc, 'group', await updateGroup(groupId, patch))
    },
    async setPicture(groupId: string, imageId: string | null) {
      applyEvent(qc, 'group', await setGroupPicture(groupId, imageId))
    },
    async remove(groupId: string) {
      await deleteGroup(groupId)
      applyEvent(qc, 'group_delete', { id: groupId })
    },
    async add(groupId: string, userId: string) {
      applyEvent(qc, 'membership', await addMember(groupId, userId))
    },
    async removeMember(groupId: string, userId: string) {
      await removeMember(groupId, userId)
      applyEvent(qc, 'membership_delete', { group_id: groupId, user_id: userId })
    },
    /** Leaving a room removes me; hiding a conversation is a membership, hidden. */
    async leave(groupId: string, meId: string) {
      const m = await removeMember(groupId, meId)
      if (m) applyEvent(qc, 'membership', m)
      else applyEvent(qc, 'membership_delete', { group_id: groupId, user_id: meId })
    },
    /** The conversation with one person: the existing one, or a new one; either way it is in my groups now. */
    async openDM(userId: string): Promise<Group> {
      const g = await openDM(userId)
      applyEvent(qc, 'group', g)
      return g
    },
  }
}

/** What was done to me, newest first, paged. */
export function useNotifications() {
  const q = useInfiniteQuery({
    queryKey: keys.notifications,
    queryFn: ({ pageParam }) => listNotifications(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before,
  })
  const seen = new Set<string>()
  const notifications = (q.data?.pages ?? [])
    .flatMap((p) => p.notifications)
    .filter((n) => !seen.has(n.id) && seen.add(n.id))
    .sort((a, b) => b.created_at - a.created_at)
  return {
    notifications,
    loading: q.isPending || q.isFetchingNextPage,
    error: q.error,
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
  }
}

/** Opening a notification reads it: the cache moves at once, the server's row follows through the same path. */
export function useReadNotification() {
  const qc = useQueryClient()
  return (n: Notification) => {
    if (n.read_at != null) return
    applyEvent(qc, 'notification', { ...n, read_at: Date.now() })
    readNotification(n.id).then(
      (read) => applyEvent(qc, 'notification', read),
      (e: unknown) => console.error('could not mark as read', e),
    )
  }
}

/** Clearing the ones I have opened: the reply goes through the cache's one write path. */
export function useClearNotifications() {
  const qc = useQueryClient()
  return async () => {
    applyEvent(qc, 'notification_delete', await clearNotifications())
  }
}

/** How far I have read each stream. `loaded` says the answer is in, not merely empty. */
export function useMarkers() {
  const q = useQuery({ queryKey: keys.markers, queryFn: listMarkers })
  return { markers: q.data?.markers ?? [], loaded: q.data !== undefined }
}

/** Is anything on the notifications stream newer than where I have read to? The bell's dot. */
export function useUnreadNotifications(): boolean {
  const { markers } = useMarkers()
  return (markers.find((m) => m.stream === NOTIFICATIONS)?.unread ?? 0) > 0
}

/** The places with something unread, by group id, and in which stream: the dots in the nav and inside a room. */
export function useUnreadPlaces(): Map<string, UnreadPlace> {
  const { markers } = useMarkers()
  return unreadPlaces(markers)
}

/** PUTs waiting to go, one per stream: the latest time wins. */
const pendingMarks = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * I have read a stream up to a time: the cache moves at once, the server's
 * answer follows through the same path. A chat marks with a debounce (the
 * document's "updated from the client with a debounce"), so a busy room is
 * one PUT, not one per message.
 */
export function useMarkRead() {
  const qc = useQueryClient()
  return (stream: string, readAt: number, debounceMs = 0) => {
    const me = qc.getQueryData<User | null>(keys.me)
    applyEvent(qc, 'marker', { user_id: me?.id ?? '', stream, read_at: readAt, unread: 0 })
    const send = () => {
      pendingMarks.delete(stream)
      setMarker(stream, readAt).then(
        (m) => applyEvent(qc, 'marker', m),
        (e: unknown) => console.error('could not mark as read', e),
      )
    }
    const waiting = pendingMarks.get(stream)
    if (waiting) clearTimeout(waiting)
    if (debounceMs <= 0) send()
    else pendingMarks.set(stream, setTimeout(send, debounceMs))
  }
}

/** A person's page: who they are, their standing, their bio. */
export function useProfile(name: string) {
  const q = useQuery({
    queryKey: keys.profile(name),
    queryFn: () => getProfile(name),
    retry: (n, e) => n < 1 && !(e instanceof ApiError && e.status === 404),
  })
  return { profile: q.data, loading: q.isPending, error: q.error }
}

/** A person's posts, newest first, from the rooms I am in; applyEvent keeps the list current. */
export function useUserPosts(name: string) {
  const q = useInfiniteQuery({
    queryKey: keys.userPosts(name),
    queryFn: ({ pageParam }) => getUserPosts(name, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before,
  })
  const seen = new Set<string>()
  const posts = (q.data?.pages ?? [])
    .flatMap((p) => p.posts)
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => b.created_at - a.created_at)
  return {
    posts,
    loading: q.isPending || q.isFetchingNextPage,
    error: q.error,
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
  }
}

/** My bio: the reply is my profile, applied as the stream would apply it. */
export function useSetBio() {
  const qc = useQueryClient()
  return async (html: string) => {
    applyEvent(qc, 'profile', await setBio(html))
  }
}

/** The instance's settings; only the root owner may ask. */
export function useSettings(enabled: boolean) {
  const q = useQuery({ queryKey: keys.settings, queryFn: getSettings, enabled })
  return { settings: q.data, error: q.error }
}

export function useSetSettings() {
  const qc = useQueryClient()
  return async (s: Settings) => {
    applyEvent(qc, 'settings', await setSettings(s))
  }
}

export function useSetPicture() {
  const qc = useQueryClient()
  return async (imageId: string | null) => {
    applyEvent(qc, 'user', await setPicture(imageId))
  }
}
