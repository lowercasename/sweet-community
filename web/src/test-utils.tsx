import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { makeQueryClient } from './data/client'
import type { Comment, Group, Member, Message, Post, User } from './api'

/** Render inside a fresh query cache; returns the client so tests can seed or inspect it. */
export function renderWithQuery(ui: ReactNode) {
  const qc = makeQueryClient()
  const result = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
  return { qc, ...result }
}

/** A control's name as assistive tech reads it: its aria-label, else its text without aria-hidden decoration. */
export const nameOf = (el: HTMLElement): string =>
  el.getAttribute('aria-label') ??
  [...el.childNodes]
    .filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true'))
    .map((n) => n.textContent)
    .join('')

export const nobody = { edit: false, delete: false }
export const mine = { edit: true, delete: true }

/** The root group's fixed id (perm.Root on the server). */
export const ROOT = '00000000-0000-7000-8000-000000000000'

export const user = (id: string, picture: string | null = null): User => ({ id, username: id, picture })

export const member = (id: string, role: Member['role'] = 'member'): Member => ({ ...user(id), role, joined_at: 1 })

/** A group as its viewer sees it: with their role and what they may do. */
export const group = (id: string, role: Group['role'], extra: Partial<Group> = {}): Group => ({
  id,
  kind: id === ROOT ? 'root' : 'group',
  name: id === ROOT ? '' : id,
  mode: 'both',
  created_at: 1,
  last_message_at: null,
  role,
  can: {
    add_members: role !== 'member',
    remove_members: role !== 'member' && id !== ROOT,
    set_roles: role === 'owner',
    transfer: role === 'owner',
    rename: role === 'owner' && id !== ROOT,
    set_mode: role === 'owner',
    delete: role === 'owner' && id !== ROOT,
    leave: role !== 'owner' && id !== ROOT,
    create_groups: id === ROOT ? true : undefined,
    manage_instance: id === ROOT ? role === 'owner' : undefined,
  },
  ...extra,
})

/** A DM as its viewer sees it: chat only, named by its people, grown by any of them. */
export const dm = (id: string, people: User[], extra: Partial<Group> = {}): Group => ({
  id,
  kind: 'dm',
  name: '',
  mode: 'chat',
  created_at: 1,
  last_message_at: null,
  role: 'member',
  can: {
    add_members: true,
    remove_members: false,
    set_roles: false,
    transfer: false,
    rename: false,
    set_mode: false,
    delete: false,
    leave: true,
  },
  members: people,
  ...extra,
})

export const post = (id: string, author: User, extra: Partial<Post> = {}): Post => ({
  id,
  group_id: ROOT,
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
  group_id: ROOT,
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
  group_id: ROOT,
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
