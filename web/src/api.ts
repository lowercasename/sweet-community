// API contract. Same origin, JSON, timestamps in Unix ms UTC, ids are UUIDs.

export interface User {
  id: string
  username: string
  /** Avatar url, or null for the donut. */
  picture: string | null
}

/** What the signed-in person may do to one resource. The server's call (internal/perm); the client shows it. */
export interface Can {
  edit: boolean
  delete: boolean
}

export type Role = 'owner' | 'moderator' | 'member'

/** Someone on the instance: a person with their role in the root group. */
export interface Member extends User {
  role: Role
  joined_at: number
  /** Whether I may remove them from the instance: the server's call, per viewer. */
  can: { remove: boolean }
}

/** What the signed-in person may do to a group. */
export interface GroupCan {
  add_members: boolean
  remove_members: boolean
  set_roles: boolean
  transfer: boolean
  rename: boolean
  set_mode: boolean
  delete: boolean
  leave: boolean
  /** Root group only: the instance's group_creation setting, applied to me. */
  create_groups?: boolean
  /** Root group only: I edit the instance's settings. */
  manage_instance?: boolean
}

export type GroupMode = 'posts' | 'chat' | 'both'

/** The instance's settings (architecture.md, Feature flags). */
export interface Settings {
  group_creation: 'anyone' | 'staff'
}

/** A group as its viewer sees it (architecture.md, Groups). The instance is the one of kind root. */
export interface Group {
  id: string
  kind: 'root' | 'group' | 'dm'
  name: string
  /** The group's one setting: posts, chat or both. A DM is chat. */
  mode: GroupMode
  created_at: number
  /** When its newest live message was sent, or null. Server-computed; orders the Messages page. */
  last_message_at: number | null
  /** The viewer's own role in it. */
  role: Role
  can: GroupCan
  /** DMs only: a DM is named by its people, present or away. */
  members?: User[]
  /** DMs only: set while I have hidden it. It is listed for me under Hidden on All messages, and nothing else of it is. */
  hidden_at?: number | null
}

export interface Membership {
  group_id: string
  user: User
  role: Role
  joined_at: number
  /** Set while I have hidden a conversation; never carried for anyone else. */
  hidden_at?: number | null
}

export interface UploadedImage {
  id: string
  url: string
  width: number
  height: number
}

export interface Invite {
  code: string
  /** Path of the join page, e.g. /join/abc. */
  url: string
  created_by: User
  created_at: number
  expires_at: number
}

export interface Session {
  user: User
  /** The session token, for clients that cannot hold the cookie. */
  token: string
}

export interface Post {
  id: string
  group_id: string
  author: User
  body_html: string
  body_text: string
  created_at: number
  /** Unix ms of the last edit, or null if never edited. */
  edited_at: number | null
  comment_count: number
  can: Can
}

export interface Comment {
  id: string
  post_id: string
  group_id: string
  /** The post's author may delete any comment on it; the server already folded that into `can`. */
  post_author_id: string
  author: User
  body_html: string
  body_text: string
  created_at: number
  edited_at: number | null
  can: Can
}

export interface Message {
  id: string
  group_id: string
  author: User
  body_html: string
  body_text: string
  created_at: number
  can: Can
}

export interface MessagePage {
  messages: Message[]
  next_before: number | null
}

export interface PostPage {
  posts: Post[]
  next_before: number | null
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 204) return undefined as T
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    if (isJson) {
      try {
        const body = (await res.json()) as { error?: string }
        if (body.error) message = body.error
      } catch {
        // keep the status text
      }
    }
    throw new ApiError(res.status, message)
  }
  if (!isJson) {
    // Usually a stale backend answering with the app page. Say so.
    throw new ApiError(res.status, `The server sent a page instead of data for ${path}. Is the backend up to date?`)
  }
  return (await res.json()) as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const g = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}`

/** Takes someone off the instance (architecture.md, Admin tools): their words stay under a removed name. */
export async function removeUser(userId: string): Promise<void> {
  await request(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function getMe(): Promise<User> {
  return request<User>('/api/me')
}

export function listGroups(): Promise<{ groups: Group[] }> {
  return request('/api/groups')
}

export function createGroup(name: string, mode: GroupMode): Promise<Group> {
  return request<Group>('/api/groups', json('POST', { name, mode }))
}

export function updateGroup(groupId: string, patch: { name?: string; mode?: GroupMode }): Promise<Group> {
  return request<Group>(g(groupId), json('PUT', patch))
}

export function getSettings(): Promise<Settings> {
  return request<Settings>('/api/settings')
}

export function setSettings(s: Settings): Promise<Settings> {
  return request<Settings>('/api/settings', json('PUT', s))
}

/** A DM with these people: the existing one if there is one, else a new one. */
export function openDM(members: string[]): Promise<Group> {
  return request<Group>('/api/groups', json('POST', { kind: 'dm', members }))
}

export async function deleteGroup(groupId: string): Promise<void> {
  await request(g(groupId), { method: 'DELETE' })
}

export function listMembers(groupId: string): Promise<{ members: Membership[] }> {
  return request(`${g(groupId)}/members`)
}

export function addMember(groupId: string, userId: string): Promise<Membership> {
  return request<Membership>(`${g(groupId)}/members`, json('POST', { user_id: userId }))
}

/** The owner sets member or moderator; role owner hands the group over. */
export function setMemberRole(groupId: string, userId: string, role: Role): Promise<Membership> {
  return request<Membership>(`${g(groupId)}/members/${encodeURIComponent(userId)}`, json('PUT', { role }))
}

/** Remove someone, or leave when it is yourself. */
/** Removes from a room (nothing comes back); steps out of a conversation (the membership, stepped out, comes back). */
export function removeMember(groupId: string, userId: string): Promise<Membership | undefined> {
  return request<Membership | undefined>(`${g(groupId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function getPosts(groupId: string, before?: number | null, limit = 20): Promise<PostPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before != null) params.set('before', String(before))
  return request<PostPage>(`${g(groupId)}/posts?${params}`)
}

export function createPost(groupId: string, bodyHtml: string): Promise<Post> {
  return request<Post>(`${g(groupId)}/posts`, json('POST', { body_html: bodyHtml }))
}

export function updatePost(id: string, bodyHtml: string): Promise<Post> {
  return request<Post>(`/api/posts/${encodeURIComponent(id)}`, json('PUT', { body_html: bodyHtml }))
}

export async function deletePost(id: string): Promise<void> {
  await request(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getMessages(groupId: string, before?: number | null, limit = 50): Promise<MessagePage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before != null) params.set('before', String(before))
  return request<MessagePage>(`${g(groupId)}/messages?${params}`)
}

export function createMessage(groupId: string, bodyHtml: string): Promise<Message> {
  return request<Message>(`${g(groupId)}/messages`, json('POST', { body_html: bodyHtml }))
}

export async function deleteMessage(id: string): Promise<void> {
  await request(`/api/messages/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getComments(postId: string): Promise<{ comments: Comment[] }> {
  return request(`/api/posts/${encodeURIComponent(postId)}/comments`)
}

export function createComment(postId: string, bodyHtml: string): Promise<Comment> {
  return request<Comment>(`/api/posts/${encodeURIComponent(postId)}/comments`, json('POST', { body_html: bodyHtml }))
}

export function updateComment(id: string, bodyHtml: string): Promise<Comment> {
  return request<Comment>(`/api/comments/${encodeURIComponent(id)}`, json('PUT', { body_html: bodyHtml }))
}

export async function deleteComment(id: string): Promise<void> {
  await request(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function login(username: string, password: string): Promise<Session> {
  return request<Session>('/api/login', json('POST', { username, password }))
}

export function register(code: string, username: string, password: string): Promise<Session> {
  return request<Session>('/api/register', json('POST', { code, username, password }))
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' })
}

export async function logoutEverywhere(): Promise<void> {
  await fetch('/api/logout-all', { method: 'POST' })
}

export function getInvite(code: string): Promise<{ invited_by: string }> {
  return request(`/api/invites/${encodeURIComponent(code)}`)
}

export function createInvite(): Promise<Invite> {
  return request<Invite>('/api/invites', { method: 'POST' })
}

export function listInvites(): Promise<{ invites: Invite[] }> {
  return request('/api/invites')
}

export async function revokeInvite(code: string): Promise<void> {
  await fetch(`/api/invites/${encodeURIComponent(code)}`, { method: 'DELETE' })
}

/** Everyone on the instance: the root group's members with their roles. */
export function listUsers(): Promise<{ users: Member[] }> {
  return request('/api/users')
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const form = new FormData()
  form.append('file', file)
  return request<UploadedImage>('/api/images', { method: 'POST', body: form })
}

export function setPicture(imageId: string | null): Promise<User> {
  return request<User>('/api/me/picture', json('PUT', { image_id: imageId }))
}
