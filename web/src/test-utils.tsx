import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { makeQueryClient } from './data/client'
import type { Comment, Me, Message, Post, User } from './api'

/** Render inside a fresh query cache; returns the client so tests can seed or inspect it. */
export function renderWithQuery(ui: ReactNode) {
  const qc = makeQueryClient()
  const result = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
  return { qc, ...result }
}

export const nobody = { edit: false, delete: false }
export const mine = { edit: true, delete: true }

export const user = (id: string, role: User['role'] = 'member', picture: string | null = null): User => ({
  id,
  username: id,
  role,
  picture,
})

export const me = (id: string, role: User['role'] = 'member'): Me => ({
  ...user(id, role),
  can: { invite: role !== 'member', manage_roles: role === 'owner' },
})

export const post = (id: string, author: User, extra: Partial<Post> = {}): Post => ({
  id,
  author,
  body_html: `<p>${id}</p>`,
  body_text: id,
  created_at: Number.parseInt(id.replace(/\D/g, ''), 10) || 1,
  edited_at: null,
  comment_count: 0,
  can: nobody,
  ...extra,
})

export const comment = (id: string, postId: string, author: User, extra: Partial<Comment> = {}): Comment => ({
  id,
  post_id: postId,
  post_author_id: 'kit',
  author,
  body_html: `<p>${id} says hi</p>`,
  body_text: `${id} says hi`,
  created_at: Number.parseInt(id.replace(/\D/g, ''), 10) || 1,
  edited_at: null,
  can: nobody,
  ...extra,
})

export const message = (id: string, author: User, extra: Partial<Message> = {}): Message => ({
  id,
  author,
  body_html: `<p>${id}</p>`,
  body_text: id,
  created_at: Number.parseInt(id.replace(/\D/g, ''), 10) || 1,
  can: nobody,
  ...extra,
})

/** An EventSource stand-in whose last instance can be made to emit. */
export class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static last: FakeEventSource | null = null
  readyState = 1
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  private listeners = new Map<string, ((ev: MessageEvent<string>) => void)[]>()
  constructor() {
    FakeEventSource.last = this
  }
  addEventListener(kind: string, fn: (ev: MessageEvent<string>) => void) {
    this.listeners.set(kind, [...(this.listeners.get(kind) ?? []), fn])
  }
  close() {}
  /** Deliver an event as the server would: a kind, a JSON body, a sequence. */
  emit(kind: string, data: unknown, seq: number) {
    for (const fn of this.listeners.get(kind) ?? []) {
      fn(new MessageEvent<string>(kind, { data: JSON.stringify(data), lastEventId: String(seq) }))
    }
  }
}
