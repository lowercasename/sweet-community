import { type QueryClient, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  getPostNotificationPreference,
  setPostNotificationPreference,
  getRoomNotificationPreference,
  setRoomNotificationPreference,
  readAllNotifications,
  type RoomNotificationMode,
  addMember,
  getLinkPreview,
  changeEmail,
  getAccount,
  getVersion,
  getRules,
  setRules,
  getWelcome,
  setWelcome,
  listReports,
  closeReport,
  getMySettings,
  setMySettings,
  clearNotifications,
  createComment,
  readNotification,
  createGroup,
  createInvite,
  createMessage,
  createPost,
  createTopic,
  deleteTopic,
  followTopic,
  listTopics,
  setPostTopic,
  updateTopic,
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
  search,
  setBio,
  setGroupPicture,
  setMarker,
  setMemberRole,
  setPicture,
  getFrequentReactions,
  setReaction,
  setSettings,
  setUsername,
  updateComment,
  updateGroup,
  updatePost,
  type Group,
  type GroupMode,
  type Invite,
  type Reactions,
  type Member,
  type MySettingsUpdate,
  type Notification,
  type ReportKind,
  type Role,
  type Settings,
  type Topic,
  type User,
} from '../api'
import { applyEvent, applyFollowing, refetchForOwnRole, refreshIdentities } from './apply'
import { ROOT_ID, keys } from './keys'
import { NOTIFICATIONS, unreadPlaces, type UnreadPlace } from './notifications'

/*
 * Queries hold server data. Stream events update the cache. Writes either apply
 * their response or refetch when a delayed response could overwrite newer state.
 * Components keep no server data of their own.
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
      // Set "me" to null first, so the observer that renders the app sees it,
      // and then remove the rest. Clearing the whole cache first would leave
      // that observer holding the removed query and its old data.
      qc.setQueryData<User | null>(keys.me, null)
      for (const pending of pendingMarks.values()) clearTimeout(pending.timer)
      pendingMarks.clear()
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    },
    /** The user's account was removed from the instance. The server has already ended the session. Clears the cache. */
    gone() {
      qc.setQueryData<User | null>(keys.me, null)
      for (const pending of pendingMarks.values()) clearTimeout(pending.timer)
      pendingMarks.clear()
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    },
  }
}

/** Removes a user from the instance. Staff do this from People, and any user does it to themselves from Settings. */
export function useRemoveUser() {
  const qc = useQueryClient()
  return async (userId: string) => {
    await removeUser(userId)
    applyEvent(qc, 'membership_delete', { group_id: ROOT_ID, user_id: userId })
  }
}

const byId = (r: { users: Member[] }) => new Map(r.users.map((u) => [u.id, u]))

/** Every user on the instance, by id. */
export function useUsers() {
  return useQuery({ queryKey: keys.users, queryFn: listUsers, select: byId })
}

/** The current state of a user. Reads the users cache first, and falls back to the author snapshot that came with the content. */
export function useAuthor(author: User): User
export function useAuthor(author: User | null): User | null
export function useAuthor(author: User | null): User | null {
  const { data: users } = useUsers()
  return author ? (users?.get(author.id) ?? author) : null
}

/** The groups the user is in, with the root group first. */
export function useGroups() {
  const q = useQuery({ queryKey: keys.groups, queryFn: listGroups })
  return { groups: q.data?.groups ?? [], loading: q.isPending, error: q.error }
}

/** The instance itself, as a group. Undefined until the groups are loaded. */
export function useRootGroup(): Group | undefined {
  return useGroups().groups.find((g) => g.kind === 'root')
}

/**
 * A list that the server sends a page at a time, the newest page first, with the cursor of the page before in
 * next_before. `items` takes the list out of a page. The list comes back without duplicates, newest first or oldest
 * first. loadMore fetches the page before the loaded ones.
 */
function usePages<P extends { next_before: string | null }, T extends { id: string; created_at: number }>(
  queryKey: readonly unknown[],
  fetch: (before: string | null) => Promise<P>,
  items: (page: P) => T[],
  order: 'newest first' | 'oldest first' = 'newest first',
) {
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetch(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_before,
  })
  const seen = new Set<string>()
  const list = (q.data?.pages ?? [])
    .flatMap(items)
    .filter((x) => !seen.has(x.id) && seen.add(x.id))
    .sort((a, b) => {
      const compared = a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      return order === 'oldest first' ? compared : -compared
    })
  return {
    items: list,
    loading: q.isPending || q.isFetchingNextPage,
    error: q.error,
    hasMore: q.hasNextPage,
    loadMore: () => q.fetchNextPage(),
  }
}

export function usePosts(groupId: string, topicId: string | null = null) {
  const { items, ...rest } = usePages(
    keys.posts(groupId, topicId),
    (before) => getPosts(groupId, before, 20, topicId),
    (p) => p.posts,
  )
  return { posts: items, ...rest }
}

/** Fetches the post's current state for its page. */
export function usePost(id: string, enabled = true) {
  const q = useQuery({
    queryKey: keys.post(id),
    queryFn: () => getPost(id),
    enabled,
    // A 404 is a definite answer, not a transient failure, so it is not retried.
    retry: (n, e) => n < 1 && !(e instanceof ApiError && e.status === 404),
  })
  return { post: q.data, loading: q.isPending, error: q.error }
}

export function usePostActions(groupId: string) {
  const qc = useQueryClient()
  return {
    async create(html: string, topicId: string | null = null) {
      applyEvent(qc, 'post', await createPost(groupId, html, topicId))
    },
    async edit(id: string, html: string) {
      applyEvent(qc, 'post', await updatePost(id, html))
    },
    /** Sets a post's topic, or clears it with null. */
    async setTopic(id: string, topicId: string | null) {
      applyEvent(qc, 'post', await setPostTopic(id, topicId))
    },
    async remove(id: string) {
      await deletePost(id)
      applyEvent(qc, 'post_delete', { id, group_id: groupId })
    },
  }
}

/** A post's comments, oldest first. The newest page loads first (listComments), and loadEarlier loads the page before. */
export function useComments(postId: string) {
  const { items, hasMore, loadMore, ...rest } = usePages(
    keys.comments(postId),
    (before) => getComments(postId, before),
    (p) => p.comments,
    'oldest first',
  )
  return { comments: items, hasEarlier: hasMore, loadEarlier: loadMore, ...rest }
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

/** A group's messages, oldest first. Pages arrive newest first, and older pages are fetched backwards. */
export function useMessages(groupId: string) {
  const { items, hasMore, loadMore, ...rest } = usePages(
    keys.messages(groupId),
    (before) => getMessages(groupId, before),
    (p) => p.messages,
    'oldest first',
  )
  return { messages: items, hasEarlier: hasMore, loadEarlier: loadMore, ...rest }
}

export function useMessageActions(groupId: string) {
  const qc = useQueryClient()
  return {
    async send(html: string, replyTo?: string) {
      applyEvent(qc, 'message', await createMessage(groupId, html, replyTo))
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

/** The owner sets a member's role to member or moderator, or transfers ownership with role owner. */
export function useSetRole(groupId: string) {
  const qc = useQueryClient()
  return async (userId: string, role: Role) => {
    applyEvent(qc, 'membership', await setMemberRole(groupId, userId, role))
    // A transfer of ownership also makes the viewer a moderator. The response carries only the new owner's
    // membership, so the client refetches what depends on the viewer's role now. It does not wait for the stream's
    // event for the viewer's membership, which may be late or never arrive while the stream is disconnected.
    if (role === 'owner') refetchForOwnRole(qc, groupId)
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
    /** Leaving a room deletes the membership. Leaving a conversation hides it, and returns the hidden membership. */
    async leave(groupId: string, meId: string) {
      const m = await removeMember(groupId, meId)
      if (m) applyEvent(qc, 'membership', m)
      else applyEvent(qc, 'membership_delete', { group_id: groupId, user_id: meId })
    },
    /** Opens the conversation with one user. Returns the existing conversation or creates a new one. Either way it is now in the groups list. */
    async openDM(userId: string): Promise<Group> {
      const g = await openDM(userId)
      applyEvent(qc, 'group', g)
      return g
    },
  }
}

/** The user's notifications, newest first, paged. */
export function useNotifications() {
  const { items, ...rest } = usePages(keys.notifications, listNotifications, (p) => p.notifications)
  return { notifications: items, ...rest }
}

/** Marks the opened notification version read, then refreshes current notifications and counts. */
export function useReadNotification() {
  const qc = useQueryClient()
  return (n: Notification) => {
    if (n.read_at != null) return
    readNotification(n.id, n.created_at, n.activity_count ?? 1).then(
      () => refreshNotifications(qc),
      (e: unknown) => console.error('could not mark as read', e),
    )
  }
}

function refreshNotifications(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: keys.notifications }),
    qc.invalidateQueries({ queryKey: keys.markers }),
  ])
}

/** Clears read and unread notifications, then fetches the current list and counts. */
export function useClearNotifications() {
  const qc = useQueryClient()
  return async () => {
    await clearNotifications()
    await refreshNotifications(qc)
  }
}

/** The user's read markers for each stream. `loaded` is true once the query has data, as opposed to an empty default. */
export function useMarkers() {
  const q = useQuery({ queryKey: keys.markers, queryFn: listMarkers })
  return { markers: q.data?.markers ?? [], loaded: q.data !== undefined }
}

/** Whether the notifications stream has unread notifications. Shown as the dot on the Notifications nav item. */
export function useUnreadNotifications(): boolean {
  const { markers } = useMarkers()
  return (markers.find((m) => m.stream === NOTIFICATIONS)?.unread ?? 0) > 0
}

/** The groups with unread content, by group id, and which stream is unread. Shown as the dots in the nav and inside a room. */
export function useUnreadPlaces(): Map<string, UnreadPlace> {
  const { markers } = useMarkers()
  return unreadPlaces(markers)
}

/** Debounced marker PUTs that have not been sent yet, one per stream. The latest time wins. */
const pendingMarks = new Map<string, { timer: ReturnType<typeof setTimeout>; readAt: number }>()

/**
 * Marks a stream read up to a time and applies the server's reply. A chat marks with a
 * debounce, so a busy room sends one PUT, not one per message.
 */
export function useMarkRead() {
  const qc = useQueryClient()
  return (stream: string, readAt: number, debounceMs = 0) => {
    const waiting = pendingMarks.get(stream)
    const through = Math.max(readAt, waiting?.readAt ?? 0)
    if (waiting) clearTimeout(waiting.timer)
    const send = () => {
      pendingMarks.delete(stream)
      setMarker(stream, through).then(
        (m) => applyEvent(qc, 'marker', m),
        (e: unknown) => console.error('could not mark as read', e),
      )
    }
    if (debounceMs <= 0) send()
    else pendingMarks.set(stream, { timer: setTimeout(send, debounceMs), readAt: through })
  }
}

/** A user's profile. Their user record, their role, and their bio. */
export function useProfile(name: string) {
  const q = useQuery({
    queryKey: keys.profile(name),
    queryFn: () => getProfile(name),
    retry: (n, e) => n < 1 && !(e instanceof ApiError && e.status === 404),
  })
  return { profile: q.data, loading: q.isPending, error: q.error }
}

/** A user's posts, newest first, from the groups the viewer is in. applyEvent keeps the list current. */
export function useUserPosts(name: string) {
  const { items, ...rest } = usePages(
    keys.userPosts(name),
    (before) => getUserPosts(name, before),
    (p) => p.posts,
  )
  return { posts: items, ...rest }
}

/** Search results for the query. Nothing is fetched for an empty query. */
export function useSearch(q: string) {
  const query = useQuery({ queryKey: keys.search(q), queryFn: () => search(q), enabled: q.trim() !== '' })
  return { hits: query.data?.hits ?? [], loading: query.isPending && q.trim() !== '', error: query.error }
}

/** Sets the user's bio. The reply is the user's profile, applied as a stream event would be. */
export function useSetBio() {
  const qc = useQueryClient()
  return async (html: string) => {
    applyEvent(qc, 'profile', await setBio(html))
  }
}

/** The instance's settings. Only the root owner may request them. */
/** The community's settings, mainly its name, which every page shows. Public, so the sign-in page reads them too. */
/** The community's topics, alphabetical, each with whether the user follows it. */
export function useTopics(): { topics: Topic[]; loading: boolean; error: Error | null } {
  const q = useQuery({ queryKey: keys.topics, queryFn: listTopics })
  return { topics: q.data?.topics ?? [], loading: q.isPending, error: q.error }
}

export function useTopicActions() {
  const qc = useQueryClient()
  return {
    async create(name: string, description: string) {
      applyEvent(qc, 'topic', await createTopic(name, description))
    },
    async update(id: string, name: string, description: string) {
      applyEvent(qc, 'topic', await updateTopic(id, name, description))
    },
    async remove(id: string) {
      await deleteTopic(id)
      applyEvent(qc, 'topic_delete', { id })
    },
    async follow(id: string, on: boolean) {
      applyFollowing(qc, await followTopic(id, on))
    },
  }
}

export function useSettings() {
  const q = useQuery({ queryKey: keys.settings, queryFn: getSettings })
  return { settings: q.data, error: q.error }
}

export function useSetSettings() {
  const qc = useQueryClient()
  return async (s: Pick<Settings, 'group_creation' | 'name' | 'description'>) => {
    applyEvent(qc, 'settings', await setSettings(s))
  }
}

/** Identity writes refetch current data because their response may arrive after a newer stream event. */
function useIdentityChange<T>(write: (value: T) => Promise<User>) {
  const qc = useQueryClient()
  return async (value: T) => {
    await write(value)
    refreshIdentities(qc, true)
  }
}

/**
 * Adds or removes the signed-in user's emoji on a post, comment or message. The reply is not applied to the cache. Several
 * people's reactions can arrive close together, and the stream delivers their events in the order they were saved,
 * while a reply can arrive after a newer event and put back older reactions.
 */
export function useReact() {
  return async (kind: Reactions['kind'], id: string, emoji: string, reacted: boolean) => {
    await setReaction(kind, id, emoji, reacted)
  }
}

/** The picker fetches the member's most used emoji each time it opens. */
export function useFrequentReactions() {
  return useQuery({
    queryKey: keys.frequentReactions,
    queryFn: getFrequentReactions,
    select: (d) => d.emoji,
    enabled: false,
  })
}

export function useSetUsername() {
  return useIdentityChange(setUsername)
}

export function useSetPicture() {
  return useIdentityChange(setPicture)
}

/** The user's account email address and its verification state, for Settings. */
export function useMySettings() {
  return useQuery({ queryKey: keys.mySettings, queryFn: getMySettings })
}
export function useSetMySettings() {
  const qc = useQueryClient()
  return async (s: MySettingsUpdate) => {
    await setMySettings(s)
    await qc.invalidateQueries({ queryKey: keys.mySettings })
  }
}
export function useAccount() {
  return useQuery({ queryKey: keys.account, queryFn: getAccount })
}

/** Sets a new email address. It is pending until its confirmation link is used. The reply is the current account state. */
export function useChangeEmail() {
  const qc = useQueryClient()
  return async (email: string) => {
    qc.setQueryData(keys.account, await changeEmail(email))
  }
}

/**
 * The release the server was built from, shown in the nav. It does not change while the
 * page is open, because a new build makes open tabs reload.
 */
export function useRelease(): string | undefined {
  return useQuery({ queryKey: keys.version, queryFn: getVersion, staleTime: Infinity }).data?.release
}

/** The address of the source code the server runs, which the line at the bottom of Home's feed links to. */
export function useSourceUrl(): string | undefined {
  return useQuery({ queryKey: keys.version, queryFn: getVersion, staleTime: Infinity }).data?.source_url
}

/** The two texts the owner and moderators write for every member. */
export type TextKind = 'rules' | 'welcome'

// The API functions are looked up when a hook calls them, not when this module loads.
const fetchText = (kind: TextKind) => (kind === 'rules' ? getRules() : getWelcome())
const saveText = (kind: TextKind, html: string) => (kind === 'rules' ? setRules(html) : setWelcome(html))

/** A community text's body. Its event keeps it current. */
export function useCommunityText(kind: TextKind): string | undefined {
  return useQuery({ queryKey: keys[kind], queryFn: () => fetchText(kind) }).data?.body_html
}

/** Writes a community text. The reply is the text as stored. */
export function useSetCommunityText(kind: TextKind) {
  const qc = useQueryClient()
  return async (bodyHtml: string) => {
    qc.setQueryData(keys[kind], await saveText(kind, bodyHtml))
  }
}

/** The community's rules. */
export const useRules = () => useCommunityText('rules')

/** The community's welcome message, which the welcome dialog shows. */
export const useWelcome = () => useCommunityText('welcome')

/** The items with open reports, for the owner and moderators. Report events keep them current. */
export function useReports() {
  const q = useQuery({ queryKey: keys.reports, queryFn: listReports })
  return { reports: q.data?.reports ?? [], loading: q.isPending, error: q.error }
}

/** Closes the reports of an item, by dismissing them or by deleting the item. The entry then leaves the list. */
export function useCloseReport() {
  const qc = useQueryClient()
  return async (kind: ReportKind, id: string, action: 'dismiss' | 'delete') => {
    await closeReport(kind, id, action)
    applyEvent(qc, 'report_delete', { kind, id })
  }
}

/**
 * A link's preview card. The server keeps a preview once it has fetched it, so the answer is kept for the page's
 * lifetime. null means the page gives no preview.
 */
export function useLinkPreview(url: string) {
  return useQuery({
    queryKey: keys.preview(url),
    queryFn: () => getLinkPreview(url),
    staleTime: Infinity,
    retry: false,
  })
}

export function usePostNotificationPreference(id: string, enabled = true) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: keys.postNotifications(id),
    queryFn: () => getPostNotificationPreference(id),
    enabled,
  })
  return {
    ...query,
    set: async (following: boolean) => {
      await setPostNotificationPreference(id, following)
      await qc.invalidateQueries({ queryKey: keys.postNotifications(id) })
    },
  }
}
export function useRoomNotificationPreference(id: string) {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: keys.roomNotifications(id), queryFn: () => getRoomNotificationPreference(id) })
  return {
    ...query,
    set: async (mode: RoomNotificationMode) => {
      await setRoomNotificationPreference(id, mode)
      await qc.invalidateQueries({ queryKey: keys.roomNotifications(id) })
    },
  }
}
export function useReadAllNotifications() {
  const qc = useQueryClient()
  return async () => {
    await readAllNotifications()
    await refreshNotifications(qc)
  }
}
