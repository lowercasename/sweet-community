// API contract. Same origin, JSON, timestamps in Unix ms UTC, ids are UUIDs.

export interface User {
  id: string
  username: string
}

export interface Post {
  id: string
  author: User
  body_html: string
  body_text: string
  created_at: number
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
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // non-JSON error body; keep the status text
    }
    throw new ApiError(res.status, message)
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
