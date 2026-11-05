// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { makeQueryClient } from './client'
import { keys } from './keys'
import { applyEvent } from './apply'
import { ROOT, comment, dm, group, member, message, mine, post, user } from '../test-utils'
import type { Group, Member, PostPage, User } from '../api'

/**
 * The event stream is the cache's write path: one upsert and one delete per
 * resource, idempotent, so a replay after a reconnect changes nothing.
 * Feeds and rooms are per group; people and groups are instance-wide.
 */
const kit = user('kit')
const mo = user('mo')
const CLUB = 'club'

let qc: QueryClient
const posts = (gid = ROOT) => (qc.getQueryData(keys.posts(gid)) as { pages: PostPage[] }).pages.flatMap((p) => p.posts)
const groups = () => (qc.getQueryData(keys.groups) as { groups: Group[] }).groups
const members = (gid: string) =>
  (qc.getQueryData(keys.members(gid)) as { members: { user: User; role: string }[] }).members

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

  it('adds a new comment to its thread and counts it on the post; an edit replaces without counting', () => {
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

  it('removes a deleted comment and uncounts it', () => {
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

  it('updates a person everywhere they are held, me included', () => {
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

  it('my own membership change refetches my groups and everything that carries can flags in that group', () => {
    applyEvent(qc, 'membership', { group_id: CLUB, user: kit, role: 'moderator', joined_at: 1 })
    expect(qc.getQueryState(keys.groups)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(keys.posts(CLUB))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(keys.posts(ROOT))?.isInvalidated).toBe(false)
    expect(qc.getQueryState(keys.comments('p2'))?.isInvalidated).toBe(false)
    // Someone else's change touches nothing of mine.
    applyEvent(qc, 'membership', { group_id: ROOT, user: mo, role: 'moderator', joined_at: 1 })
    expect(qc.getQueryState(keys.posts(ROOT))?.isInvalidated).toBe(false)
  })

  it('being removed from a group drops it and everything in it; someone else leaving just leaves the list', () => {
    applyEvent(qc, 'membership_delete', { group_id: CLUB, user_id: 'mo' })
    expect(members(CLUB).map((m) => m.user.id)).toEqual(['kit'])
    expect(groups().map((g) => g.id)).toContain(CLUB)
    applyEvent(qc, 'membership_delete', { group_id: CLUB, user_id: 'kit' })
    expect(groups().map((g) => g.id)).toEqual([ROOT])
    expect(qc.getQueryData(keys.posts(CLUB))).toBeUndefined()
    expect(qc.getQueryData(keys.members(CLUB))).toBeUndefined()
  })

  it('a group upserts into my list; a deleted group goes with everything in it', () => {
    applyEvent(qc, 'group', group(CLUB, 'member', { name: 'Renamed' }))
    expect(groups().find((g) => g.id === CLUB)?.name).toBe('Renamed')
    applyEvent(qc, 'group', group('new', 'owner'))
    expect(groups().map((g) => g.id)).toEqual([ROOT, CLUB, 'new'])
    applyEvent(qc, 'group_delete', { id: CLUB })
    expect(groups().map((g) => g.id)).toEqual([ROOT, 'new'])
    expect(qc.getQueryData(keys.posts(CLUB))).toBeUndefined()
  })

  it('a settings change refetches my groups, where the root carries the setting as a flag', () => {
    qc.setQueryData(keys.settings, { group_creation: 'anyone' })
    applyEvent(qc, 'settings', { group_creation: 'staff' })
    expect(qc.getQueryData(keys.settings)).toEqual({ group_creation: 'staff' })
    expect(qc.getQueryState(keys.groups)?.isInvalidated).toBe(true)
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
  it("a DM's group event carries its people, so an added person is in its name at once", () => {
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
