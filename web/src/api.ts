// API contract. Same origin, JSON, timestamps in Unix ms UTC, ids are UUIDs.

export interface User {
  id: string
  username: string
  /** "owner" runs the instance; everyone else is "member". */
  role: 'owner' | 'member'
  /** Avatar url, or null for the donut. */
  picture: string | null
}

export interface UploadedImage {
  id: string
  url: string
  width: number
  height: number
}

export interface Member extends User {
  created_at: number
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
  author: User
  body_html: string
  body_text: string
  created_at: number
  /** Unix ms of the last edit, or null if never edited. */
  edited_at: number | null
  comment_count: number
}

export interface Comment {
  id: string
  post_id: string
  author: User
  body_html: string
  body_text: string
  created_at: number
  edited_at: number | null
}

export interface Message {
  id: string
  author: User
  body_html: string
  body_text: string
  created_at: number
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

export function getMe(): Promise<User> {
  return request<User>('/api/me')
}

export function getPosts(before?: number | null, limit = 20): Promise<PostPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before != null) params.set('before', String(before))
  return request<PostPage>(`/api/posts?${params}`)
}

export function createPost(bodyHtml: string): Promise<Post> {
  return request<Post>('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body_html: bodyHtml }),
  })
}

export function updatePost(id: string, bodyHtml: string): Promise<Post> {
  return request<Post>(`/api/posts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body_html: bodyHtml }),
  })
}

export function getMessages(before?: number | null, limit = 50): Promise<MessagePage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before != null) params.set('before', String(before))
  return request<MessagePage>(`/api/messages?${params}`)
}

export function createMessage(bodyHtml: string): Promise<Message> {
  return request<Message>('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body_html: bodyHtml }),
  })
}

export function login(username: string, password: string): Promise<Session> {
  return request<Session>('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export function register(code: string, username: string, password: string): Promise<Session> {
  return request<Session>('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username, password }),
  })
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

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Could not delete (${res.status})`)
  }
}

export async function revokeInvite(code: string): Promise<void> {
  await fetch(`/api/invites/${encodeURIComponent(code)}`, { method: 'DELETE' })
}

export function listUsers(): Promise<{ users: Member[] }> {
  return request('/api/users')
}

export function getComments(postId: string): Promise<{ comments: Comment[] }> {
  return request(`/api/posts/${encodeURIComponent(postId)}/comments`)
}

export function createComment(postId: string, bodyHtml: string): Promise<Comment> {
  return request<Comment>(`/api/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body_html: bodyHtml }),
  })
}

export function updateComment(id: string, bodyHtml: string): Promise<Comment> {
  return request<Comment>(`/api/comments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body_html: bodyHtml }),
  })
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const form = new FormData()
  form.append('file', file)
  return request<UploadedImage>('/api/images', { method: 'POST', body: form })
}

export function setPicture(imageId: string | null): Promise<User> {
  return request<User>('/api/me/picture', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId }),
  })
}
