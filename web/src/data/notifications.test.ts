import { describe, expect, it } from 'vitest'
import type { Marker } from '../api'
import { newerMarkers } from './notifications'

const marker = (stream: string, read_at: number, unread: number): Marker => ({
  user_id: 'kit',
  stream,
  read_at,
  unread,
})

describe('newerMarkers', () => {
  it('keeps a cached marker that is further on than the fetched one', () => {
    // A list fetched before a read was saved arrives after the save.
    const cached = { markers: [marker('post:p1', 20, 0), marker('chat:g1', 5, 1)] }
    const fetched = { markers: [marker('post:p1', 10, 1), marker('chat:g1', 5, 2)] }
    expect(newerMarkers(cached, fetched).markers).toEqual([marker('post:p1', 20, 0), marker('chat:g1', 5, 2)])
  })

  it('takes the fetched list as it is when nothing is cached, and drops streams it no longer has', () => {
    const fetched = { markers: [marker('feed:g1', 3, 0)] }
    expect(newerMarkers(undefined, fetched)).toEqual(fetched)
    expect(newerMarkers({ markers: [marker('chat:g2', 9, 0)] }, fetched).markers).toEqual([marker('feed:g1', 3, 0)])
  })
})
