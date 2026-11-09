// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { makeQueryClient } from './client'
import { keys } from './keys'
import { readFileSync } from 'node:fs'
import { EVENT_KINDS, applyEvent } from './apply'
import {
  ROOT,
  comment,
  dm,
  group,
  marker,
  member,
  message,
  mine,
  notification,
  post,
  report,
  user,
} from '../test-utils'
import type { Group, Marker, Member, Message, Notification, Post, PostPage, Report, User } from '../api'

/**
 * The event stream is the cache's write path. Each resource has one upsert
 * and one delete, both idempotent, so a replay after a reconnect changes
 * nothing. Feeds and chats are per group. Users and groups are instance-wide.
 */
const kit = user('kit')
const mo = user('mo')
const CLUB = 'club'

let qc: QueryClient
const posts = (gid = ROOT) => (qc.getQueryData(keys.posts(gid)) as { pages: PostPage[] }).pages.flatMap((p) => p.posts)
const groups = () => (qc.getQueryData(keys.groups) as { groups: Group[] }).groups
const members = (gid: string) =>
  (qc.getQueryData(keys.members(gid)) as { members: { user: User; role: string; hidden_at?: number | null }[] }).members

beforeEach(() => {
  qc = makeQueryClient()
  qc.setQueryData(keys.me, kit)
  qc.setQueryData(keys.posts(ROOT), {
    pages: [
      { posts: [post('p3', kit), post('p2', mo)], next_before: 2 },
      { posts: [post('p1', kit)], next_before: null },
    ],
    pageParams: [null, 2],
  })
  qc.setQueryData(keys.posts(CLUB), {
    pages: [{ posts: [post('c9', mo, { group_id: CLUB })], next_before: null }],
    pageParams: [null],
  })
  qc.setQueryData(keys.comments('p2'), { comments: [comment('c1', 'p2', kit)] })
  qc.setQueryData(keys.messages(ROOT), {
    pages: [{ messages: [message('m2', mo), message('m1', kit)], next_before: null }],
    pageParams: [null],
  })
  qc.setQueryData(keys.users, { users: [member('kit'), member('mo')] as Member[] })
  qc.setQueryData(keys.groups, { groups: [group(ROOT, 'member'), group(CLUB, 'member')] })
  qc.setQueryData(keys.members(CLUB), {
    members: [
      { group_id: CLUB, user: kit, role: 'owner', joined_at: 1 },
      { group_id: CLUB, user: mo, role: 'member', joined_at: 1 },
    ],
  })
})

describe('applyEvent', () => {
  it('the stream listens for every kind of event that applyEvent handles', () => {
    // The browser receives an event only for a kind it listens for. A kind missing from the list is dropped, as the
    // report and topic events were until 2026-11-08.
    const source = readFileSync('src/data/apply.ts', 'utf8')
    const handled = [...source.matchAll(/^\s+case '(\w+)':/gm)].map((m) => m[1])
    expect(handled.length).toBeGreaterThan(10)
    expect(handled.filter((k) => !(EVENT_KINDS as readonly string[]).includes(k))).toEqual([])
  })

  it('a report event puts its item first in the loaded reports, replacing its old entry, and report_delete removes it', () => {
    const list = () => (qc.getQueryData(keys.reports) as { reports: Report[] }).reports.map((r) => `${r.kind}:${r.id}`)
    qc.setQueryData(keys.reports, { reports: [report('post', 'p1'), report('message', 'm1')] })
    applyEvent(qc, 'report', report('message', 'm1'))
    applyEvent(qc, 'report', report('comment', 'c1'))
    expect(list()).toEqual(['comment:c1', 'message:m1', 'post:p1'])
    applyEvent(qc, 'report_delete', { kind: 'post', id: 'p1' })
    applyEvent(qc, 'report_delete', { kind: 'post', id: 'p1' })
    expect(list()).toEqual(['comment:c1', 'message:m1'])
  })

  it('prepends a notification to the loaded list once, and only moves a marker forward', () => {
    const list = () =>
      (qc.getQueryData(keys.notifications) as { pages: { notifications: Notification[] }[] }).pages.flatMap(
        (p) => p.notifications,
      )
    qc.setQueryData(keys.notifications, {
      pages: [{ notifications: [notification('n1', 'comment', mo)], next_before: null }],
      pageParams: [null],
    })
    applyEvent(qc, 'notification', notification('n2', 'added', mo))
    applyEvent(qc, 'notification', notification('n2', 'added', mo))
    expect(list().map((n) => n.id)).toEqual(['n2', 'n1'])
    // A clear event carries a time. Opened notifications created before it are removed. An unopened one stays.
    applyEvent(qc, 'notification', notification('n1', 'comment', mo, { read_at: 3 }))
    applyEvent(qc, 'notification_delete', { user_id: 'raphael', before: 5 })
    expect(list().map((n) => n.id)).toEqual(['n2'])

    qc.setQueryData(keys.markers, { markers: [marker('notifications', 5, 2)] })
    const markers = () => (qc.getQueryData(keys.markers) as { markers: Marker[] }).markers
    applyEvent(qc, 'marker', marker('notifications', 9, 0))
    applyEvent(qc, 'marker', marker('notifications', 7, 1))
    applyEvent(qc, 'marker', marker(`chat:${CLUB}`, 3, 4))
    expect(markers().map((m) => [m.stream, m.read_at, m.unread])).toEqual([
      ['notifications', 9, 0],
      [`chat:${CLUB}`, 3, 4],
    ])
  })

  it("increments the unread counts for other users' new messages and notifications as they arrive, and not for the viewer's own or for old ones", () => {
    qc.setQueryData(keys.markers, {
      markers: [marker('notifications', 5, 0), marker(`chat:${ROOT}`, 10, 0), marker(`chat:${CLUB}`, 10, 2)],
    })
    const unread = (stream: string) =>
      (qc.getQueryData(keys.markers) as { markers: Marker[] }).markers.find((m) => m.stream === stream)!.unread
    applyEvent(qc, 'message', message('m3', mo, { created_at: 11 }))
    applyEvent(qc, 'message', message('m4', kit, { created_at: 12 }))
    applyEvent(qc, 'message', message('m0', mo, { created_at: 9 }))
    applyEvent(qc, 'message', message('c1', mo, { group_id: CLUB, created_at: 30 }))
    // A joined or added line does not make the chat unread (architecture.md, Chat).
    applyEvent(qc, 'message', message('j1', mo, { created_at: 40, kind: 'joined', body_html: '', body_text: '' }))
    expect(unread(`chat:${ROOT}`)).toBe(1)
    expect(unread(`chat:${CLUB}`)).toBe(3)
    // A post increments the feed's unread count the same way. An edit of a post is not new.
    qc.setQueryData(keys.markers, {
      markers: [...(qc.getQueryData(keys.markers) as { markers: Marker[] }).markers, marker(`feed:${CLUB}`, 10, 0)],
    })
    applyEvent(qc, 'post', post('p7', mo, { group_id: CLUB, created_at: 11 }))
    applyEvent(qc, 'post', post('p7', mo, { group_id: CLUB, created_at: 11, edited_at: 12 }))
    applyEvent(qc, 'post', post('p8', kit, { group_id: CLUB, created_at: 13 }))
    expect(unread(`feed:${CLUB}`)).toBe(1)
    // A notification counts as unread while unopened. Opening it (the same event with read_at set) decrements the count.
    qc.setQueryData(keys.notifications, { pages: [{ notifications: [], next_before: null }], pageParams: [null] })
    applyEvent(qc, 'notification', notification('n6', 'comment', mo))
    applyEvent(qc, 'notification', notification('n4', 'comment', mo, { read_at: 8 }))
    expect(unread('notifications')).toBe(1)
    applyEvent(qc, 'notification', notification('n6', 'comment', mo, { read_at: 9 }))
    expect(unread('notifications')).toBe(0)
    // Leaving a room, or hiding a conversation, removes its marker.
    applyEvent(qc, 'membership_delete', { group_id: CLUB, user_id: 'kit' })
    expect((qc.getQueryData(keys.markers) as { markers: Marker[] }).markers.map((m) => m.stream)).toEqual([
      'notifications',
      `chat:${ROOT}`,
    ])
  })

  it('keeps a post page in sync with its feed, so edits, comment counts, author changes and deletion reach the post query', () => {
    qc.setQueryData(keys.post('p2'), post('p2', mo))
    const page = () => qc.getQueryData(keys.post('p2')) as Post | undefined
    applyEvent(qc, 'post', post('p2', mo, { body_html: '<p>new</p>', edited_at: 5 }))
    expect(page()!.body_html).toBe('<p>new</p>')
    applyEvent(qc, 'comment', comment('c2', 'p2', kit))
    expect(page()!.comment_count).toBe(1)
    expect(posts().find((p) => p.id === 'p2')!.comment_count).toBe(1)
    applyEvent(qc, 'comment_delete', { id: 'c2', post_id: 'p2', group_id: ROOT })
    expect(page()!.comment_count).toBe(0)
    applyEvent(qc, 'user', user('mo', '/img/mo'))
    expect(page()!.author.picture).toBe('/img/mo')
    // A post page query that is not loaded is not created by a post event.
    applyEvent(qc, 'post', post('p9', mo))
    expect(qc.getQueryData(keys.post('p9'))).toBeUndefined()
    applyEvent(qc, 'post_delete', { id: 'p2', group_id: ROOT })
    expect(page()).toBeUndefined()
  })

  it("keeps a user's posts list in sync, so a new post is added, an edit replaces the post, and a deletion removes it", () => {
    qc.setQueryData(keys.userPosts('mo'), {
      pages: [{ posts: [post('p2', mo)], next_before: null }],
      pageParams: [null],
    })
    const page = () => (qc.getQueryData(keys.userPosts('mo')) as { pages: PostPage[] }).pages.flatMap((p) => p.posts)
    applyEvent(qc, 'post', post('p5', mo, { group_id: CLUB }))
    expect(page().map((p) => p.id)).toEqual(['p5', 'p2'])
    applyEvent(qc, 'post', post('p2', mo, { body_html: '<p>new</p>', edited_at: 9 }))
    expect(page().find((p) => p.id === 'p2')!.body_html).toBe('<p>new</p>')
    applyEvent(qc, 'post_delete', { id: 'p2', group_id: ROOT })
    expect(page().map((p) => p.id)).toEqual(['p5'])
    // A profile event replaces the whole profile query data.
    applyEvent(qc, 'profile', { ...mo, role: 'member', joined_at: 1, bio_html: '<p>hi</p>', can: { edit: false } })
    expect((qc.getQueryData(keys.profile('mo')) as { bio_html: string }).bio_html).toBe('<p>hi</p>')
  })

  it('prepends a new post to its own group and replaces an existing one in place', () => {
    applyEvent(qc, 'post', post('p4', mo))
    expect(posts().map((p) => p.id)).toEqual(['p4', 'p3', 'p2', 'p1'])
    expect(posts(CLUB).map((p) => p.id)).toEqual(['c9'])
    applyEvent(qc, 'post', post('c8', kit, { group_id: CLUB }))
    expect(posts(CLUB).map((p) => p.id)).toEqual(['c8', 'c9'])
    applyEvent(qc, 'post', post('p1', kit, { body_html: '<p>edited</p>', edited_at: 9 }))
    expect(posts().map((p) => p.id)).toEqual(['p4', 'p3', 'p2', 'p1'])
    expect(posts()[3].body_html).toBe('<p>edited</p>')
    applyEvent(qc, 'post', post('p4', mo))
    expect(posts()).toHaveLength(4)
  })

  it('removes a deleted post from its group', () => {
    applyEvent(qc, 'post_delete', { id: 'p1', group_id: ROOT })
    expect(posts().map((p) => p.id)).toEqual(['p3', 'p2'])
    applyEvent(qc, 'post_delete', { id: 'p1', group_id: ROOT })
    expect(posts()).toHaveLength(2)
  })

  it('adds a new comment to its thread and increments the post comment count, and an edit replaces the comment without incrementing', () => {
    applyEvent(qc, 'comment', comment('c2', 'p2', mo))
    expect((qc.getQueryData(keys.comments('p2')) as { comments: unknown[] }).comments).toHaveLength(2)
    expect(posts().find((p) => p.id === 'p2')?.comment_count).toBe(1)
    applyEvent(qc, 'comment', comment('c2', 'p2', mo, { body_html: '<p>edited</p>', edited_at: 9 }))
    expect((qc.getQueryData(keys.comments('p2')) as { comments: unknown[] }).comments).toHaveLength(2)
    expect(posts().find((p) => p.id === 'p2')?.comment_count).toBe(1)
    applyEvent(qc, 'comment', comment('c3', 'p3', mo))
    expect(qc.getQueryData(keys.comments('p3'))).toBeUndefined()
    expect(posts().find((p) => p.id === 'p3')?.comment_count).toBe(1)
  })

  it('removes a deleted comment and decrements the comment count', () => {
    applyEvent(qc, 'comment_delete', { id: 'c1', post_id: 'p2', group_id: ROOT })
    expect((qc.getQueryData(keys.comments('p2')) as { comments: unknown[] }).comments).toHaveLength(0)
    expect(posts().find((p) => p.id === 'p2')?.comment_count).toBe(0)
  })

  it('appends a new message to its room, replaces a known one, removes a deleted one', () => {
    const ids = () =>
      (qc.getQueryData(keys.messages(ROOT)) as { pages: { messages: { id: string }[] }[] }).pages.flatMap((p) =>
        p.messages.map((m) => m.id),
      )
    applyEvent(qc, 'message', message('m3', kit))
    expect(ids()).toContain('m3')
    applyEvent(qc, 'message', message('m3', kit))
    expect(ids().filter((id) => id === 'm3')).toHaveLength(1)
    applyEvent(qc, 'message_delete', { id: 'm2', group_id: ROOT })
    expect(ids()).not.toContain('m2')
    applyEvent(qc, 'message', message('x1', kit, { group_id: 'elsewhere' }))
    expect(qc.getQueryData(keys.messages('elsewhere'))).toBeUndefined()
  })

  it('a deleted message turns the snippet in each reply to it into a deleted one, and a renamed author is renamed in snippets', () => {
    qc.setQueryData(keys.messages(ROOT), {
      pages: [
        {
          messages: [
            message('m2', mo, { reply_to: { id: 'm1', author: kit, text: 'hi', deleted: false } }),
            message('m1', kit),
          ],
          next_before: null,
        },
      ],
      pageParams: [null],
    })
    const reply = () =>
      (qc.getQueryData(keys.messages(ROOT)) as { pages: { messages: Message[] }[] }).pages[0].messages.find(
        (m) => m.id === 'm2',
      )?.reply_to
    applyEvent(qc, 'user', user('kit', '/img/new'))
    expect(reply()?.author?.picture).toBe('/img/new')
    applyEvent(qc, 'message_delete', { id: 'm1', group_id: ROOT })
    expect(reply()).toEqual({ id: 'm1', author: null, text: '', deleted: true })
  })

  it('updates a user in every place the cache holds them, including the signed-in user', () => {
    applyEvent(qc, 'user', user('kit', '/img/new'))
    expect((qc.getQueryData(keys.users) as { users: Member[] }).users.find((u) => u.id === 'kit')?.picture).toBe(
      '/img/new',
    )
    expect((qc.getQueryData(keys.users) as { users: Member[] }).users.find((u) => u.id === 'kit')?.role).toBe('member')
    expect((qc.getQueryData(keys.me) as User).picture).toBe('/img/new')
  })

  it('a membership updates the group members list and the instance list for the root', () => {
    applyEvent(qc, 'membership', { group_id: CLUB, user: user('jo'), role: 'member', joined_at: 5 })
    expect(members(CLUB).map((m) => m.user.id)).toEqual(['kit', 'mo', 'jo'])
    applyEvent(qc, 'membership', { group_id: ROOT, user: user('mo'), role: 'moderator', joined_at: 1 })
    expect((qc.getQueryData(keys.users) as { users: Member[] }).users.find((u) => u.id === 'mo')?.role).toBe(
      'moderator',
    )
    applyEvent(qc, 'membership', { group_id: ROOT, user: user('jo'), role: 'member', joined_at: 5 })
    expect((qc.getQueryData(keys.users) as { users: Member[] }).users.map((u) => u.id)).toEqual(['kit', 'mo', 'jo'])
  })

  it("a change to the viewer's own membership refetches the groups and everything that carries can flags in that group", () => {
    applyEvent(qc, 'membership', { group_id: CLUB, user: kit, role: 'moderator', joined_at: 1 })
    expect(qc.getQueryState(keys.groups)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(keys.posts(CLUB))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(keys.posts(ROOT))?.isInvalidated).toBe(false)
    expect(qc.getQueryState(keys.comments('p2'))?.isInvalidated).toBe(false)
    // Another user's membership change invalidates nothing of the viewer's.
    applyEvent(qc, 'membership', { group_id: ROOT, user: mo, role: 'moderator', joined_at: 1 })
    expect(qc.getQueryState(keys.posts(ROOT))?.isInvalidated).toBe(false)
  })

  it('being removed from a group removes it and everything in it from the cache, and another user leaving only removes them from the members list', () => {
    applyEvent(qc, 'membership_delete', { group_id: CLUB, user_id: 'mo' })
    expect(members(CLUB).map((m) => m.user.id)).toEqual(['kit'])
    expect(groups().map((g) => g.id)).toContain(CLUB)
    applyEvent(qc, 'membership_delete', { group_id: CLUB, user_id: 'kit' })
    expect(groups().map((g) => g.id)).toEqual([ROOT])
    expect(qc.getQueryData(keys.posts(CLUB))).toBeUndefined()
    expect(qc.getQueryData(keys.members(CLUB))).toBeUndefined()
  })

  it('a user event updates the author in loaded feeds, threads and chats, whether or not the user is in the users list', () => {
    qc.setQueryData(keys.comments('p2'), { comments: [comment('c1', 'p2', mo)] })
    qc.setQueryData(keys.messages(ROOT), {
      pages: [{ messages: [message('m1', mo)], next_before: null }],
      pageParams: [null],
    })
    applyEvent(qc, 'user', { id: 'mo', username: 'removed-abc', picture: null })
    expect(posts().find((p) => p.id === 'p2')?.author.username).toBe('removed-abc')
    expect((qc.getQueryData(keys.comments('p2')) as { comments: { author: User }[] }).comments[0].author.username).toBe(
      'removed-abc',
    )
    expect(
      (qc.getQueryData(keys.messages(ROOT)) as { pages: { messages: { author: User }[] }[] }).pages[0].messages[0]
        .author.username,
    ).toBe('removed-abc')
  })

  it('leaving the root group is leaving the instance, so the user is removed from the users list, and the viewer is signed out with the cache cleared', () => {
    qc.setQueryData(keys.users, { users: [member('kit'), member('mo')] })
    applyEvent(qc, 'membership_delete', { group_id: ROOT, user_id: 'mo' })
    expect((qc.getQueryData(keys.users) as { users: Member[] }).users.map((u) => u.id)).toEqual(['kit'])
    applyEvent(qc, 'membership_delete', { group_id: ROOT, user_id: 'kit' })
    expect(qc.getQueryData(keys.me)).toBeNull()
    expect(qc.getQueryData(keys.posts(ROOT))).toBeUndefined()
  })

  it('a group event upserts into the groups list, and a deleted group is removed with everything in it', () => {
    applyEvent(qc, 'group', group(CLUB, 'member', { name: 'Renamed' }))
    expect(groups().find((g) => g.id === CLUB)?.name).toBe('Renamed')
    applyEvent(qc, 'group', group('new', 'owner'))
    expect(groups().map((g) => g.id)).toEqual([ROOT, CLUB, 'new'])
    applyEvent(qc, 'group_delete', { id: CLUB })
    expect(groups().map((g) => g.id)).toEqual([ROOT, 'new'])
    expect(qc.getQueryData(keys.posts(CLUB))).toBeUndefined()
  })

  it('a settings change refetches the groups, because the root group carries the setting as a can flag', () => {
    qc.setQueryData(keys.settings, { group_creation: 'anyone' })
    applyEvent(qc, 'settings', { group_creation: 'staff' })
    expect(qc.getQueryData(keys.settings)).toEqual({ group_creation: 'staff' })
    expect(qc.getQueryState(keys.groups)?.isInvalidated).toBe(true)
  })

  it('a rules or welcome event replaces that text, and leaves the other alone', () => {
    qc.setQueryData(keys.rules, { body_html: '<p>Be kind.</p>' })
    applyEvent(qc, 'welcome', { body_html: '<p>Hello.</p>' })
    expect(qc.getQueryData(keys.welcome)).toEqual({ body_html: '<p>Hello.</p>' })
    expect(qc.getQueryData(keys.rules)).toEqual({ body_html: '<p>Be kind.</p>' })
    applyEvent(qc, 'rules', { body_html: '' })
    expect(qc.getQueryData(keys.rules)).toEqual({ body_html: '' })
    expect(qc.getQueryData(keys.welcome)).toEqual({ body_html: '<p>Hello.</p>' })
  })

  it('ignores events for caches that are not loaded', () => {
    const empty = makeQueryClient()
    applyEvent(empty, 'post', post('p9', kit))
    applyEvent(empty, 'post_delete', { id: 'p9', group_id: ROOT })
    applyEvent(empty, 'user', user('kit'))
    applyEvent(empty, 'membership', { group_id: ROOT, user: kit, role: 'member', joined_at: 1 })
    expect(empty.getQueryData(keys.posts(ROOT))).toBeUndefined()
    expect(empty.getQueryData(keys.users)).toBeUndefined()
    expect(empty.getQueryData(keys.groups)).toBeUndefined()
  })

  it('keeps can flags from the stream, which the server computed for this viewer', () => {
    applyEvent(qc, 'post', post('p5', kit, { can: mine }))
    expect(posts()[0].can).toEqual(mine)
  })
})

describe('latest activity', () => {
  it('hiding a conversation keeps it in the groups list marked hidden and removes its contents, and its members do not change', () => {
    qc.setQueryData(keys.groups, { groups: [group(ROOT, 'member'), dm('d1', [kit, mo])] })
    qc.setQueryData(keys.messages('d1'), { pages: [], pageParams: [] })
    qc.setQueryData(keys.members('d1'), {
      members: [
        { group_id: 'd1', user: kit, role: 'member', joined_at: 1 },
        { group_id: 'd1', user: mo, role: 'member', joined_at: 1 },
      ],
    })
    expect(
      groups()
        .find((g) => g.id === 'd1')
        ?.members?.map((u) => u.id),
    ).toEqual(['kit', 'mo'])
    applyEvent(qc, 'membership', { group_id: 'd1', user: kit, role: 'member', joined_at: 1, hidden_at: 10 })
    expect(groups().find((g) => g.id === 'd1')?.hidden_at).toBe(10)
    expect(qc.getQueryData(keys.messages('d1'))).toBeUndefined()
    expect(qc.getQueryData(keys.members('d1'))).toBeUndefined()
  })

  it("a DM's group event carries its members, so an added user appears in its name at once", () => {
    qc.setQueryData(keys.groups, { groups: [group(ROOT, 'member'), dm('d1', [kit, mo])] })
    applyEvent(qc, 'group', dm('d1', [kit, mo, user('jo')]))
    expect(
      groups()
        .find((g) => g.id === 'd1')
        ?.members?.map((u) => u.id),
    ).toEqual(['kit', 'mo', 'jo'])
  })

  it("a message moves its group's last_message_at forward, and a replayed older one never moves it back", () => {
    qc.setQueryData(keys.groups, { groups: [group(ROOT, 'member'), dm('d1', [kit, mo])] })
    applyEvent(qc, 'message', message('m5', mo, { group_id: 'd1', created_at: 500 }))
    expect(groups().find((g) => g.id === 'd1')!.last_message_at).toBe(500)
    expect(groups().find((g) => g.id === ROOT)!.last_message_at).toBeNull()
    applyEvent(qc, 'message', message('m1', mo, { group_id: 'd1', created_at: 100 }))
    expect(groups().find((g) => g.id === 'd1')!.last_message_at).toBe(500)
  })
})
