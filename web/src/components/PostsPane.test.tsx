// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { ROOT, marker, post, renderWithQuery, user } from '../test-utils'

/** A visible feed is marked read, as with a group's chat. */
vi.mock('../api', () => ({
  getFrequentReactions: vi.fn(() => Promise.resolve({ emoji: [] })),
  getPosts: vi.fn(),
  listMarkers: vi.fn(),
  setMarker: vi.fn(),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listGroups: vi.fn(() => Promise.resolve({ groups: [] })),
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

describe('PostsPane read marker', () => {
  it('moves the read marker to the newest post while watched', async () => {
    const { setMarker } = await import('../api')
    await draw(true)
    await vi.waitFor(() => expect(setMarker).toHaveBeenCalledWith(`feed:${ROOT}`, 20), { timeout: 3000 })
  })

  it('does not move the read marker while not watched', async () => {
    const { setMarker } = await import('../api')
    await draw(false)
    await new Promise((r) => setTimeout(r, 1200))
    expect(setMarker).not.toHaveBeenCalled()
  })
})

describe('Home without topics', () => {
  it('fetches Home without a category and has no topic controls', async () => {
    const { getPosts } = await import('../api')
    await draw(false)
    expect(getPosts).toHaveBeenCalledWith(ROOT, null, 20)
    expect(screen.queryByRole('button', { name: 'Topic' })).toBeNull()
    expect(screen.queryByText('Add topics')).toBeNull()
  })
})
