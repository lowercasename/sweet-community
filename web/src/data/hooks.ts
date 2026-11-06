import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  addMember,
  createComment,
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
  getPosts,
  getSettings,
  listGroups,
  listInvites,
  listMembers,
  listUsers,
  logout,
  openDM,
  removeMember,
  revokeInvite,
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
  type Role,
  type Settings,
  type User,
} from '../api'
import { applyEvent } from './apply'
import { keys } from './keys'

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
    /** A DM with these people: the existing one, or a new one; either way it is in my groups now. */
    async openDM(userIds: string[]): Promise<Group> {
      const g = await openDM(userIds)
      applyEvent(qc, 'group', g)
      return g
    },
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
