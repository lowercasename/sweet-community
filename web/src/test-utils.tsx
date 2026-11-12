import type { ReactNode } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { makeQueryClient } from './data/client'
import type { Comment, Group, Marker, Member, Message, Notification, Post, Report, User } from './api'

/**
 * Renders inside a new query cache, seeded first if `seed` is given. Returns the client so that tests can seed or
 * inspect it.
 */
export function renderWithQuery(ui: ReactNode, seed?: (qc: QueryClient) => void) {
  const qc = makeQueryClient()
  seed?.(qc)
  const result = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
  return { qc, ...result }
}

/**
 * A control's accessible name as assistive technology reads it. This is its aria-label, or otherwise its text
 * without the aria-hidden decoration.
 */
export const nameOf = (el: HTMLElement): string =>
  el.getAttribute('aria-label') ??
  [...el.childNodes]
    .filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true'))
    .map((n) => n.textContent)
    .join('')

export const nobody = { edit: false, delete: false, report: false }
export const mine = { edit: true, delete: true, report: false }
/** Another member's content, which the viewer can only report. */
export const reportable = { edit: false, delete: false, report: true }

/** The root group's fixed ID (perm.Root on the server). */
export const ROOT = '00000000-0000-7000-8000-000000000000'

export const user = (id: string, picture: string | null = null): User => ({ id, username: id, picture })

export const member = (id: string, role: Member['role'] = 'member', remove = false): Member => ({
  ...user(id),
  role,
  joined_at: 1,
  can: { remove },
})

/** A group as its viewer sees it, with the viewer's role and permissions. */
export const group = (id: string, role: Group['role'], extra: Partial<Group> = {}): Group => ({
  id,
  kind: id === ROOT ? 'root' : 'group',
  name: id === ROOT ? '' : id,
  mode: 'both',
  created_at: 1,
  picture: null,
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
    manage_topics: id === ROOT ? role !== 'member' : undefined,
    manage_rules: id === ROOT ? role !== 'member' : undefined,
    manage_welcome: id === ROOT ? role !== 'member' : undefined,
    handle_reports: id === ROOT ? role !== 'member' : undefined,
  },
  ...extra,
})

/** A conversation as its viewer sees it. It is chat only and named after its members, who are fixed. */
export const dm = (id: string, people: User[], extra: Partial<Group> = {}): Group => ({
  id,
  kind: 'dm',
  name: '',
  mode: 'chat',
  created_at: 1,
  picture: null,
  last_message_at: null,
  role: 'member',
  can: {
    add_members: false,
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

/** A one-paragraph body for fixtures. The markup is defined here because the atomic check allows it in this file. */
export const paragraph = (text: string) => `<p>${text}</p>`

/** A mention in the form the server stores it. */
export const mentionSpan = (id: string, name: string) =>
  `<span data-type="mention" data-mention-id="${id}">@${name}</span>`

export const post = (id: string, author: User, extra: Partial<Post> = {}): Post => ({
  id,
  group_id: ROOT,
  topic_id: null,
  author,
  body_html: `<p>${id}</p>`,
  body_text: id,
  created_at: Number.parseInt(id.replace(/\D/g, ''), 10) || 1,
  edited_at: null,
  comment_count: 0,
  reactions: [],
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
  reactions: [],
  can: nobody,
  ...extra,
})

export const notification = (
  id: string,
  kind: Notification['kind'],
  actor: User,
  extra: Partial<Notification> = {},
): Notification => ({
  id,
  user_id: 'raphael',
  kind,
  actor: kind === 'report' ? null : actor,
  group_id: ROOT,
  post_id: kind === 'comment' ? `p-${id}` : null,
  created_at: Number.parseInt(id.replace(/\D/g, ''), 10) || 1,
  read_at: null,
  ...extra,
})

export const marker = (stream: string, readAt: number, unread = 0): Marker => ({
  user_id: 'raphael',
  stream,
  read_at: readAt,
  unread,
})

export const message = (id: string, author: User, extra: Partial<Message> = {}): Message => ({
  id,
  group_id: ROOT,
  author,
  body_html: `<p>${id}</p>`,
  body_text: id,
  created_at: Number.parseInt(id.replace(/\D/g, ''), 10) || 1,
  reactions: [],
  can: nobody,
  reply_to: null,
  kind: 'message',
  subject: null,
  ...extra,
})

/** A fake EventSource. Tests can make the most recently created instance emit events. */
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
  /** Delivers an event in the same form as the server: a kind, a JSON body and a sequence number. */
  emit(kind: string, data: unknown, seq: number) {
    for (const fn of this.listeners.get(kind) ?? []) {
      fn(new MessageEvent<string>(kind, { data: JSON.stringify(data), lastEventId: String(seq) }))
    }
  }
}

/** A reported item with one report, as the owner or a moderator receives it. */
export const report = (kind: Report['kind'], id: string, extra: Partial<Report> = {}): Report => ({
  kind,
  id,
  group_id: ROOT,
  group_kind: 'root',
  group_name: '',
  post_id: kind === 'message' ? null : 'p1',
  author: user('kit'),
  body_html: `<p>${id} was reported</p>`,
  deleted: false,
  reports: [{ id: 'r1', reason: 'Spam link', created_at: 1 }],
  can: { open: true },
  ...extra,
})

/** A link preview card's paragraph, as the server stores it. */
export const embedParagraph = (url: string) =>
  `<p data-embed=""><a href="${url}" rel="noreferrer noopener" target="_blank">${url}</a></p>`
