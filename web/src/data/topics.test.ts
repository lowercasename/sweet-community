// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { makeQueryClient } from './client'
import { keys } from './keys'
import { applyEvent, applyFollowing } from './apply'
import { describe as words } from './notifications'
import { ROOT, group, notification, post, user } from '../test-utils'
import type { PostPage, Topic } from '../api'

/**
 * Topics in the cache. The list is instance-wide
 * and alphabetical. A post belongs in the topic view it is filed under and
 * in no other. A deleted topic leaves its posts with no topic.
 */
const kit = user('kit')
const mo = user('mo')
const topic = (id: string, name: string, extra: Partial<Topic> = {}): Topic => ({
  id,
  name,
  description: '',
  created_at: 1,
  post_count: 0,
  follower_count: 0,
  following: false,
  ...extra,
})

let qc: QueryClient
const feed = (topicId?: string) =>
  (qc.getQueryData(keys.posts(ROOT, topicId)) as { pages: PostPage[] } | undefined)?.pages
    .flatMap((p) => p.posts)
    .map((p) => p.id)
    .sort()
    .reverse()
const topics = () => (qc.getQueryData(keys.topics) as { topics: Topic[] }).topics

beforeEach(() => {
  qc = makeQueryClient()
  qc.setQueryData(keys.me, kit)
  qc.setQueryData(keys.topics, {
    topics: [topic('t-practice', 'Practice', { following: true }), topic('t-reading', 'Reading')],
  })
  const page = (posts: ReturnType<typeof post>[]) => ({ pages: [{ posts, next_before: null }], pageParams: [null] })
  qc.setQueryData(
    keys.posts(ROOT),
    page([post('p3', kit, { topic_id: 't-practice' }), post('p2', mo), post('p1', kit)]),
  )
  qc.setQueryData(keys.posts(ROOT, 't-practice'), page([post('p3', kit, { topic_id: 't-practice' })]))
  qc.setQueryData(keys.posts(ROOT, 't-reading'), page([]))
})

describe('topics in the cache', () => {
  it('keeps the list alphabetical ignoring case, and keeps the following flag when the stream delivers a rename', () => {
    applyEvent(qc, 'topic', topic('t-hangout', 'hangout'))
    expect(topics().map((t) => t.name)).toEqual(['hangout', 'Practice', 'Reading'])
    applyEvent(qc, 'topic', topic('t-practice', 'Practice notes'))
    const renamed = topics().find((t) => t.id === 't-practice')!
    expect(renamed.name).toBe('Practice notes')
    expect(renamed.following).toBe(true)
    // The reply to the user's own follow or unfollow is authoritative for the following flag.
    applyFollowing(qc, topic('t-practice', 'Practice notes', { following: false, follower_count: 0 }))
    expect(topics().find((t) => t.id === 't-practice')!.following).toBe(false)
  })

  it('puts a post in the topic view it is filed under and takes it out of the one it left', () => {
    // A new post in Reading appears on the feed and in Reading, and not in Practice.
    applyEvent(qc, 'post', post('p4', mo, { topic_id: 't-reading' }))
    expect(feed()).toEqual(['p4', 'p3', 'p2', 'p1'])
    expect(feed('t-reading')).toEqual(['p4'])
    expect(feed('t-practice')).toEqual(['p3'])
    // A post moved from Practice to Reading changes views. A post edited in place keeps its position.
    applyEvent(qc, 'post', post('p3', kit, { topic_id: 't-reading' }))
    expect(feed('t-practice')).toEqual([])
    expect(feed('t-reading')).toEqual(['p4', 'p3'])
    expect(feed()).toEqual(['p4', 'p3', 'p2', 'p1'])
    // A post with its topic removed leaves every topic view and stays on the feed.
    applyEvent(qc, 'post', post('p3', kit, { topic_id: null }))
    expect(feed('t-reading')).toEqual(['p4'])
    expect(feed()).toEqual(['p4', 'p3', 'p2', 'p1'])
    // A deleted post is removed from the feed and from its topic view.
    applyEvent(qc, 'post_delete', { id: 'p4', group_id: ROOT })
    expect(feed('t-reading')).toEqual([])
    expect(feed()).toEqual(['p3', 'p2', 'p1'])
  })

  it('a deleted topic is removed from the list, its posts have no topic, and its view is removed from the cache', () => {
    applyEvent(qc, 'topic_delete', { id: 't-practice' })
    expect(topics().map((t) => t.id)).toEqual(['t-reading'])
    const p3 = (qc.getQueryData(keys.posts(ROOT)) as { pages: PostPage[] }).pages[0].posts.find((p) => p.id === 'p3')!
    expect(p3.topic_id).toBeNull()
    expect(qc.getQueryData(keys.posts(ROOT, 't-practice'))).toBeUndefined()
  })
})

describe('the description of a post in a followed topic', () => {
  it('names the topic, or says a topic when the topic is not in the cache', () => {
    const n = notification('n1', 'topic_post', mo, { post_id: 'p9', topic_id: 't-practice' })
    expect(words(n, [group(ROOT, 'member')], topics())).toBe('posted in Practice')
    expect(words(n, [group(ROOT, 'member')], [])).toBe('posted in a topic')
  })
})
