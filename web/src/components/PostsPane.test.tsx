// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { ROOT, marker, post, renderWithQuery, user } from '../test-utils'

/** Looking at a feed is reading it, as with a room's chat (architecture.md, Notifications). */
vi.mock('../api', () => ({
  getPosts: vi.fn(),
  listMarkers: vi.fn(),
  setMarker: vi.fn(),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

const mo = user('mo')

afterEach(cleanup)

beforeEach(async () => {
  const { getPosts, listMarkers, setMarker } = await import('../api')
  vi.mocked(getPosts).mockResolvedValue({ posts: [post('p20', mo), post('p10', mo)], next_before: null })
  vi.mocked(listMarkers).mockResolvedValue({ markers: [marker(`feed:${ROOT}`, 10, 1)] })
  vi.mocked(setMarker).mockImplementation((stream, readAt) => Promise.resolve(marker(stream, readAt, 0)))
})

async function draw(watching: boolean) {
  const { PostsPane } = await import('./PostsPane')
  renderWithQuery(<PostsPane groupId={ROOT} watching={watching} />)
  await screen.findByText('p20')
}

describe('PostsPane reading', () => {
  it('moves my marker to the newest post while watched', async () => {
    const { setMarker } = await import('../api')
    await draw(true)
    await vi.waitFor(() => expect(setMarker).toHaveBeenCalledWith(`feed:${ROOT}`, 20), { timeout: 3000 })
  })

  it('reads nothing while not watched', async () => {
    const { setMarker } = await import('../api')
    await draw(false)
    await new Promise((r) => setTimeout(r, 1200))
    expect(setMarker).not.toHaveBeenCalled()
  })
})
