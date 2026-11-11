// @vitest-environment happy-dom
import { QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { comment, marker, message, notification, post, ROOT, user } from '../test-utils'
import { applyEvent } from './apply'
import { makeQueryClient } from './client'
import { keys } from './keys'

const mo = user('mo')

describe('server counts', () => {
  it.each(['absent', 'partial', 'complete'])(
    'refreshes comment counts with a %s thread after repeated updates',
    async (thread) => {
      const qc = makeQueryClient()
      const c = comment('c1', 'p1', mo)
      const old = post('p1', mo, { comment_count: 4 })
      const page = (count: number) => ({
        pages: [{ posts: [{ ...old, comment_count: count }], next_before: null }],
        pageParams: [null],
      })
      let count = 5
      if (thread !== 'absent')
        qc.setQueryData(keys.comments('p1'), {
          pages: [{ comments: thread === 'complete' ? [c] : [], next_before: thread === 'partial' ? 'earlier' : null }],
          pageParams: [null],
        })
      const queries = [
        { key: keys.post('p1'), old, read: () => ({ ...old, comment_count: count }) },
        { key: keys.posts(ROOT), old: page(4), read: () => page(count) },
        { key: keys.posts(ROOT, 'topic'), old: page(4), read: () => page(count) },
        { key: keys.userPosts('mo'), old: page(4), read: () => page(count) },
      ]
      const stops = queries.map(({ key, old, read }) => {
        qc.setQueryData(key, old)
        return new QueryObserver(qc, { queryKey: key, queryFn: async () => read() }).subscribe(() => {})
      })
      try {
        for (let i = 0; i < 3; i++) applyEvent(qc, 'comment', c)
        await vi.waitFor(() => {
          for (const query of queries) expect(qc.getQueryData(query.key)).toEqual(query.read())
        })
        count = 4
        for (let i = 0; i < 3; i++) applyEvent(qc, 'comment_delete', { id: c.id, post_id: 'p1', group_id: ROOT })
        await vi.waitFor(() => {
          for (const query of queries) expect(qc.getQueryData(query.key)).toEqual(query.read())
        })
      } finally {
        stops.forEach((stop) => stop())
        qc.clear()
      }
    },
  )

  it.each(['absent', 'partial', 'complete'])(
    'refreshes unread counts with %s lists after repeated updates and deletion',
    async (loaded) => {
      const qc = makeQueryClient()
      const events = [
        ['post', post('p1', mo), 'posts', keys.posts(ROOT)],
        ['message', message('m1', mo), 'messages', keys.messages(ROOT)],
        ['notification', notification('n1', 'comment', mo), 'notifications', keys.notifications],
      ] as const
      if (loaded !== 'absent')
        for (const [, item, field, key] of events)
          qc.setQueryData(key, {
            pages: [
              { [field]: loaded === 'complete' ? [item] : [], next_before: loaded === 'partial' ? 'earlier' : null },
            ],
            pageParams: [null],
          })
      const counts = (unread: number) => ({
        markers: [
          marker('notifications', 0, unread),
          marker(`chat:${ROOT}`, 0, unread),
          marker(`feed:${ROOT}`, 0, unread),
        ],
      })
      let unread = 7
      let current = counts(unread)
      qc.setQueryData(keys.markers, counts(0))
      const stop = new QueryObserver(qc, { queryKey: keys.markers, queryFn: async () => current }).subscribe(() => {})
      try {
        for (const [kind, item] of events) {
          current = counts(unread++)
          for (let i = 0; i < 3; i++) applyEvent(qc, kind, item)
          await vi.waitFor(() => expect(qc.getQueryData(keys.markers)).toEqual(current))
        }
        const deletions = [
          ['post_delete', { id: 'p1', group_id: ROOT }],
          ['message_delete', { id: 'm1', group_id: ROOT }],
          ['notification', notification('n1', 'comment', mo, { read_at: 5 })],
        ] as const
        for (const [kind, item] of deletions) {
          current = counts(--unread)
          for (let i = 0; i < 3; i++) applyEvent(qc, kind, item)
          await vi.waitFor(() => expect(qc.getQueryData(keys.markers)).toEqual(current))
        }
      } finally {
        stop()
        qc.clear()
      }
    },
  )
})
