// API contract. Requests go to the same origin and use JSON. Timestamps are Unix ms UTC. IDs are UUIDs.

export interface User {
  id: string
  username: string
  /** Avatar URL, or null to show the default donut image. */
  picture: string | null
}

/** What the signed-in user may do to one resource. The server decides this (internal/perm) and the client shows it. */
export interface Can {
  edit: boolean
  delete: boolean
  /**
   * Posts only (architecture.md, Topics). Whether I may file the post under a topic. This is true for the post's
   * author and for the community's staff.
   */
  set_topic?: boolean
}

/**
 * A topic (architecture.md, Topics). A topic is a label on a post in the
 * community's feed. A post has at most one topic. The staff manage the list of
 * topics. `following` is the current user's follow state.
 */
export interface Topic {
  id: string
  name: string
  description: string
  created_at: number
  post_count: number
  follower_count: number
  following: boolean
}

export type Role = 'owner' | 'moderator' | 'member'

/** A user on the instance, with their role in the root group. */
export interface Member extends User {
  role: Role
  joined_at: number
  /** Whether I may remove this user from the instance. The server computes this for each viewer. */
  can: { remove: boolean }
}

/** What the signed-in user may do to a group. */
export interface GroupCan {
  add_members: boolean
  remove_members: boolean
  set_roles: boolean
  transfer: boolean
  rename: boolean
  set_mode: boolean
  delete: boolean
  leave: boolean
  /** Root group only. The result of the instance's group_creation setting for the current user. */
  create_groups?: boolean
  /** Root group only. Whether the current user may edit the instance's settings. */
  manage_instance?: boolean
}

export type GroupMode = 'posts' | 'chat' | 'both'

/** The instance's settings (architecture.md, Feature flags). */
/**
 * The instance's settings (architecture.md, Admin tools). The owner sets these
 * for the community. Anyone can read them, signed in or not, because the
 * sign-in and join pages show the community's name. `owner_set` is state, not
 * a setting. It is false until the setup link has been used. The name is
 * empty until the owner names the community during onboarding.
 */
export interface Settings {
  group_creation: 'anyone' | 'staff'
  name: string
  description: string
  owner_set: boolean
}

/** A group as its viewer sees it (architecture.md, Groups). The group of kind root represents the instance. */
export interface Group {
  id: string
  kind: 'root' | 'group' | 'dm'
  name: string
  /** The group's only setting: posts, chat or both. A DM is always chat. */
  mode: GroupMode
  created_at: number
  /** A room's picture, or null to show the tile with the room's initial. */
  picture: string | null
  /** When the group's newest live message was sent, or null. Computed by the server. Orders the Messages page. */
  last_message_at: number | null
  /** The viewer's own role in the group. */
  role: Role
  can: GroupCan
  /** DMs only. A DM is named after its members, including members who have hidden it. */
  members?: User[]
  /**
   * DMs only. Set while I have hidden the DM. While it is set, the DM is listed for me under Hidden on All messages,
   * and nothing else of the DM is shown.
   */
  hidden_at?: number | null
}

/** A user as their page shows them (architecture.md, Accounts): role, join time, and a bio that only they can edit. */
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
  /** Set while I have hidden a conversation. It is never included for any other user's membership. */
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
  /** How many users have joined through the invite. A link works for anyone who has it, for one week. */
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
  /**
   * The topic the post is filed under, or null (architecture.md, Topics). The client looks up the topic's name in the
   * topics cache at render time.
   */
  topic_id: string | null
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
  /** The post's author may delete any comment on the post. The server has already included that in `can`. */
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
  /** The message this one replies to, or null (architecture.md, Chat). */
  reply_to: ReplyTo | null
  can: Can
}

/**
 * A snippet of the message a reply answers, built by the server from the original. Once the original is deleted, the
 * author is null, the text is empty and deleted is true.
 */
export interface ReplyTo {
  id: string
  author: User | null
  text: string
  deleted: boolean
}

/**
 * A notification for the current user (architecture.md, Notifications). It has the actor, the kind and the group, and
 * for a comment, the post. Opening it marks it read.
 */
export interface Notification {
  id: string
  user_id: string
  kind: 'comment' | 'added' | 'mention' | 'joined' | 'topic_post' | 'message' | 'reply'
  actor: User
  group_id: string
  post_id: string | null
  /** The topic, for a post in a topic I follow. */
  topic_id?: string | null
  /** The chat message a mention or reply is in, for scrolling to it. */
  message_id?: string | null
  created_at: number
  /** When I opened the notification, or null if I have not opened it. */
  read_at: number | null
}

export interface NotificationPage {
  notifications: Notification[]
  next_before: number | null
}

/**
 * How far I have read in a stream. The stream is `notifications` or `chat:<group id>`. There is one row per stream of
 * mine, whether or not I have read it. The marker only moves forward.
 */
export interface Marker {
  user_id: string
  stream: string
  read_at: number
  /**
   * How many items in the stream are newer than read_at. For a chat, this counts other users' messages. For
   * notifications, it counts notifications. The server computes the count.
   */
  unread: number
}

/**
 * One search result (architecture.md, Search). It has the kind of item, the group, the author, and an excerpt with
 * its matches marked.
 */
export interface Hit {
  kind: 'post' | 'comment' | 'message'
  id: string
  group_id: string
  post_id: string | null
  author: User
  created_at: number
  /** Plain text. Each match is wrapped in \x01 and \x02. */
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
  /** Fields of the error response other than `error`. For example, a refused sign-in names the unverified address. */
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
        // Keep the status text as the message.
      }
    }
    throw new ApiError(res.status, message, body)
  }
  const text = await res.text()
  // An accepted request with nothing to return (for example, when a link has been emailed) has no body.
  if (text === '') return undefined as T
  if (!isJson) {
    // This is usually an outdated backend responding with the app's HTML page. Report that in the error.
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

/**
 * Removes a user from the instance (architecture.md, Admin tools). Their posts, comments and messages stay, under a
 * removed name.
 */
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

/** Sets a room's picture to an uploaded image's ID, or to null to show the tile. Only the owner can do this. */
export function setGroupPicture(groupId: string, imageId: string | null): Promise<Group> {
  return request<Group>(`${g(groupId)}/picture`, json('PUT', { image_id: imageId }))
}

export function getSettings(): Promise<Settings> {
  return request<Settings>('/api/settings')
}

export function setSettings(s: Pick<Settings, 'group_creation' | 'name' | 'description'>): Promise<Settings> {
  return request<Settings>('/api/settings', json('PUT', s))
}

/**
 * Used by the setup link's page. Creates the owner's account with a fresh instance's one-time token and returns a
 * signed-in session.
 */
export function setup(token: string, username: string, email: string, password: string): Promise<Session> {
  return request<Session>('/api/setup', json('POST', { token, username, email, password }))
}

/** Opens the conversation with one user. Returns the existing conversation if there is one, or creates a new one. */
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

/** The owner sets a member's role to member or moderator. Setting the role to owner transfers the group. */
export function setMemberRole(groupId: string, userId: string, role: Role): Promise<Membership> {
  return request<Membership>(`${g(groupId)}/members/${encodeURIComponent(userId)}`, json('PUT', { role }))
}

/** Removes a user from a group, or leaves the group when the user is yourself. */
/**
 * For a room, removes the membership and returns nothing. For a conversation, hides it for that user and returns the
 * membership with `hidden_at` set.
 */
export function removeMember(groupId: string, userId: string): Promise<Membership | undefined> {
  return request<Membership | undefined>(`${g(groupId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function getPosts(
  groupId: string,
  before?: number | null,
  limit = 20,
  topicId?: string | null,
): Promise<PostPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before != null) params.set('before', String(before))
  if (topicId) params.set('topic', topicId)
  return request<PostPage>(`${g(groupId)}/posts?${params}`)
}

/**
 * Fetches one post by its ID, for the post's page when its feed is not loaded. Returns 404 when the post is deleted
 * or I may not see it.
 */
export function getPost(id: string): Promise<Post> {
  return request<Post>(`/api/posts/${encodeURIComponent(id)}`)
}

export function createPost(groupId: string, bodyHtml: string, topicId: string | null = null): Promise<Post> {
  return request<Post>(`${g(groupId)}/posts`, json('POST', { body_html: bodyHtml, topic_id: topicId }))
}

/**
 * Files a post under a topic, or under no topic (architecture.md, Topics). Only the post's author or the community's
 * staff can do this.
 */
export function setPostTopic(id: string, topicId: string | null): Promise<Post> {
  return request<Post>(`/api/posts/${encodeURIComponent(id)}/topic`, json('PUT', { topic_id: topicId }))
}

export function listTopics(): Promise<{ topics: Topic[] }> {
  return request('/api/topics')
}

export function createTopic(name: string, description: string): Promise<Topic> {
  return request<Topic>('/api/topics', json('POST', { name, description }))
}

export function updateTopic(id: string, name: string, description: string): Promise<Topic> {
  return request<Topic>(`/api/topics/${encodeURIComponent(id)}`, json('PUT', { name, description }))
}

export async function deleteTopic(id: string): Promise<void> {
  await request(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * Follows a topic, so that I get notifications for posts in it, or unfollows it. The response is the topic as I now
 * see it.
 */
export function followTopic(id: string, on: boolean): Promise<Topic> {
  return request<Topic>(`/api/topics/${encodeURIComponent(id)}/follow`, { method: on ? 'PUT' : 'DELETE' })
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

export function createMessage(groupId: string, bodyHtml: string, replyTo?: string): Promise<Message> {
  return request<Message>(`${g(groupId)}/messages`, json('POST', { body_html: bodyHtml, reply_to: replyTo ?? null }))
}

export async function deleteMessage(id: string): Promise<void> {
  await request(`/api/messages/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function listNotifications(before?: number | null, limit = 30): Promise<NotificationPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before != null) params.set('before', String(before))
  return request<NotificationPage>(`/api/notifications?${params}`)
}

/** The result of clearing notifications. Clearing removed every opened notification of mine up to the time `before`. */
export interface Cleared {
  user_id: string
  before: number
}

/** Marks a notification read when it is opened. The response is the notification, now read. */
export function readNotification(id: string): Promise<Notification> {
  return request<Notification>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' })
}

/** Permanently deletes the notifications I have opened. */
export function clearNotifications(): Promise<Cleared> {
  return request<Cleared>('/api/notifications', { method: 'DELETE' })
}

/** Returns the matches from the groups I am a member of, best match first, up to fifty. */
export function search(q: string): Promise<{ hits: Hit[] }> {
  return request(`/api/search?q=${encodeURIComponent(q)}`)
}

export function listMarkers(): Promise<{ markers: Marker[] }> {
  return request('/api/markers')
}

/**
 * Records that I have read this stream up to this time. The server caps the time at the current time and never moves
 * a marker back.
 */
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

/**
 * My own account (architecture.md, Accounts): the email address, whether it is verified, and a new address that is
 * waiting to be verified.
 */
export interface Account {
  email: string | null
  email_verified: boolean
  pending_email: string | null
}

/** Creates the account and sends a link to the email address. Opening the link signs the user in (verifyEmail). */
export function register(code: string, username: string, password: string, email: string): Promise<{ email: string }> {
  return request('/api/register', json('POST', { code, username, password, email }))
}

export function verifyEmail(token: string): Promise<Session> {
  return request<Session>('/api/verify', json('POST', { token }))
}

/**
 * Sends a new link to an unverified address. The server gives the same response whether or not it knows the
 * address.
 */
export async function resendVerification(email: string): Promise<void> {
  await request('/api/verify/resend', json('POST', { email }))
}

/**
 * Replaces the mistyped address of an account that has never been verified. The password is used instead of a
 * session.
 */
export async function changeUnverifiedEmail(username: string, password: string, email: string): Promise<void> {
  await request('/api/verify/change', json('POST', { username, password, email }))
}

export async function requestReset(email: string): Promise<void> {
  await request('/api/reset', json('POST', { email }))
}

export function resetPassword(token: string, password: string): Promise<Session> {
  return request<Session>(`/api/reset/${encodeURIComponent(token)}`, json('POST', { password }))
}

/** My own settings (architecture.md, Notifications): whether the weekly digest is on or off. */
export interface MySettings {
  digest: 'weekly' | 'off'
}

export function getMySettings(): Promise<MySettings> {
  return request('/api/me/settings')
}

export function setMySettings(s: MySettings): Promise<MySettings> {
  return request<MySettings>('/api/me/settings', json('PUT', s))
}

/** Returns the server's public key for web push, or a 404 when push is not set up. */
export function getPushKey(): Promise<{ key: string }> {
  return request('/api/push/key')
}

/**
 * Registers this device's push subscription, as the browser describes it. The server stores it so that it can send
 * this device push notifications for mentions and replies.
 */
export function subscribePush(sub: PushSubscriptionJSON): Promise<void> {
  return request('/api/push/subscriptions', json('POST', sub))
}

export function unsubscribePush(endpoint: string): Promise<void> {
  return request('/api/push/subscriptions', json('DELETE', { endpoint }))
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

/** Lists every user on the instance: the root group's members with their roles. */
export function listUsers(): Promise<{ users: Member[] }> {
  return request('/api/users')
}

/** Fetches one user by username. Returns 404 when no user has that name, or when the user has been removed. */
export function getProfile(name: string): Promise<Profile> {
  return request<Profile>(`/api/users/${encodeURIComponent(name)}`)
}

/** Sets my bio, which is a body like any other. An empty body clears it. The response is my profile. */
export function setBio(bodyHtml: string): Promise<Profile> {
  return request<Profile>('/api/me/bio', json('PUT', { body_html: bodyHtml }))
}

/** Returns one user's posts, newest first, from the groups I am a member of. */
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
