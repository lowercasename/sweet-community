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
/**
 * The instance's settings (architecture.md, Admin tools): what the owner
 * sets about the community, readable by anyone, signed in or not, since the
 * sign-in and join pages wear its name. `owner_set` is state: false until
 * the setup link has been used. The name is empty until the owner names
 * the community, which is onboarding.
 */
export interface Settings {
  group_creation: 'anyone' | 'staff'
  name: string
  description: string
  owner_set: boolean
}

/** A group as its viewer sees it (architecture.md, Groups). The instance is the one of kind root. */
export interface Group {
  id: string
  kind: 'root' | 'group' | 'dm'
  name: string
  /** The group's one setting: posts, chat or both. A DM is chat. */
  mode: GroupMode
  created_at: number
  /** A room's picture, or null for the tile with its initial. */
  picture: string | null
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

/** A person as their page shows them (architecture.md, Accounts): standing, joined, a bio they alone edit. */
export interface Profile extends User {
  role: Role
  joined_at: number
  bio_html: string
  can: { edit: boolean }
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
  /** How many people have joined through it: a link is good for anyone who has it, for its week. */
  uses: number
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

/** One thing done to me (architecture.md, Notifications): who, what kind, where; a comment's post. Read by opening it. */
export interface Notification {
  id: string
  user_id: string
  kind: 'comment' | 'added' | 'mention' | 'joined'
  actor: User
  group_id: string
  post_id: string | null
  created_at: number
  /** When I opened it; null until I do. */
  read_at: number | null
}

export interface NotificationPage {
  notifications: Notification[]
  next_before: number | null
}

/** How far along a stream I have read: `notifications`, or `chat:<group id>`. One row per stream of mine, read or not. Forward only. */
export interface Marker {
  user_id: string
  stream: string
  read_at: number
  /** How much of the stream is newer than read_at: others' messages in a chat, notifications on that stream. The server's count. */
  unread: number
}

/** One search result (architecture.md, Search): what kind of thing, where, who said it, and an excerpt with its matches marked. */
export interface Hit {
  kind: 'post' | 'comment' | 'message'
  id: string
  group_id: string
  post_id: string | null
  author: User
  created_at: number
  /** Plain text; a match is wrapped in \x01 and \x02. */
  excerpt: string
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
  /** What else the server said, beyond `error`: a refused sign-in names the unverified address. */
  body: Record<string, unknown>
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.body = body
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
    let body: Record<string, unknown> = {}
    if (isJson) {
      try {
        body = (await res.json()) as Record<string, unknown>
        if (typeof body.error === 'string') message = body.error
      } catch {
        // keep the status text
      }
    }
    throw new ApiError(res.status, message, body)
  }
  const text = await res.text()
  // An accepted request with nothing to say (a link is on its way) has no body.
  if (text === '') return undefined as T
  if (!isJson) {
    // Usually a stale backend answering with the app page. Say so.
    throw new ApiError(res.status, `The server sent a page instead of data for ${path}. Is the backend up to date?`)
  }
  return JSON.parse(text) as T
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

/** A room's picture: an uploaded image's id, or null for the tile. The owner's call. */
export function setGroupPicture(groupId: string, imageId: string | null): Promise<Group> {
  return request<Group>(`${g(groupId)}/picture`, json('PUT', { image_id: imageId }))
}

export function getSettings(): Promise<Settings> {
  return request<Settings>('/api/settings')
}

export function setSettings(s: Pick<Settings, 'group_creation' | 'name' | 'description'>): Promise<Settings> {
  return request<Settings>('/api/settings', json('PUT', s))
}

/** The setup link's page: the owner's account, from a fresh instance's one-time token; signed in. */
export function setup(token: string, username: string, email: string, password: string): Promise<Session> {
  return request<Session>('/api/setup', json('POST', { token, username, email, password }))
}

/** The conversation with one person: the existing one if there is one, else a new one. */
export function openDM(userId: string): Promise<Group> {
  return request<Group>('/api/groups', json('POST', { kind: 'dm', members: [userId] }))
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

/** One post by its address: for its page, when the feed it is in is not loaded. 404 when gone or not mine to see. */
export function getPost(id: string): Promise<Post> {
  return request<Post>(`/api/posts/${encodeURIComponent(id)}`)
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

export function listNotifications(before?: number | null, limit = 30): Promise<NotificationPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before != null) params.set('before', String(before))
  return request<NotificationPage>(`/api/notifications?${params}`)
}

/** What clearing removed: every opened notification of mine up to a time. */
export interface Cleared {
  user_id: string
  before: number
}

/** Opening a notification reads it; the reply is the row, read. */
export function readNotification(id: string): Promise<Notification> {
  return request<Notification>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' })
}

/** Clears the notifications I have opened, for good. */
export function clearNotifications(): Promise<Cleared> {
  return request<Cleared>('/api/notifications', { method: 'DELETE' })
}

/** What matches, from the rooms I am in, best first, up to fifty. */
export function search(q: string): Promise<{ hits: Hit[] }> {
  return request(`/api/search?q=${encodeURIComponent(q)}`)
}

export function listMarkers(): Promise<{ markers: Marker[] }> {
  return request('/api/markers')
}

/** I have read this stream up to this time. The server holds it to now and never moves it back. */
export function setMarker(stream: string, readAt: number): Promise<Marker> {
  return request<Marker>(`/api/markers/${encodeURIComponent(stream)}`, json('PUT', { read_at: readAt }))
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

/** My own account (architecture.md, Accounts): the address, whether it is verified, and one waiting to be. */
export interface Account {
  email: string | null
  email_verified: boolean
  pending_email: string | null
}

/** Joining makes the account and sends a link to the address; the link signs in (verifyEmail). */
export function register(code: string, username: string, password: string, email: string): Promise<{ email: string }> {
  return request('/api/register', json('POST', { code, username, password, email }))
}

export function verifyEmail(token: string): Promise<Session> {
  return request<Session>('/api/verify', json('POST', { token }))
}

/** A new link to an unverified address; the server answers the same whether or not it knows the address. */
export async function resendVerification(email: string): Promise<void> {
  await request('/api/verify/resend', json('POST', { email }))
}

/** The mistyped address of a never-verified account, replaced; the password stands in for a session. */
export async function changeUnverifiedEmail(username: string, password: string, email: string): Promise<void> {
  await request('/api/verify/change', json('POST', { username, password, email }))
}

export async function requestReset(email: string): Promise<void> {
  await request('/api/reset', json('POST', { email }))
}

export function resetPassword(token: string, password: string): Promise<Session> {
  return request<Session>(`/api/reset/${encodeURIComponent(token)}`, json('POST', { password }))
}

export function getAccount(): Promise<Account> {
  return request('/api/me/account')
}

export function changeEmail(email: string, password: string): Promise<Account> {
  return request<Account>('/api/me/email', json('PUT', { email, password }))
}

export async function changePassword(current: string, password: string): Promise<void> {
  await request('/api/me/password', json('PUT', { current, password }))
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

/** One person by name; 404 when there is nobody of that name, or they have been removed. */
export function getProfile(name: string): Promise<Profile> {
  return request<Profile>(`/api/users/${encodeURIComponent(name)}`)
}

/** My bio, a body like any other; empty clears it. The reply is my profile. */
export function setBio(bodyHtml: string): Promise<Profile> {
  return request<Profile>('/api/me/bio', json('PUT', { body_html: bodyHtml }))
}

/** One person's posts, newest first, from the rooms I am in. */
export function getUserPosts(name: string, before?: number | null, limit = 20): Promise<PostPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before != null) params.set('before', String(before))
  return request<PostPage>(`/api/users/${encodeURIComponent(name)}/posts?${params}`)
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const form = new FormData()
  form.append('file', file)
  return request<UploadedImage>('/api/images', { method: 'POST', body: form })
}

export function setPicture(imageId: string | null): Promise<User> {
  return request<User>('/api/me/picture', json('PUT', { image_id: imageId }))
}
