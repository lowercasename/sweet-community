// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { ROOT, marker, post, renderWithQuery, user } from '../test-utils'

/** A visible feed is marked read, as with a group's chat (architecture.md, Notifications). */
vi.mock('../api', () => ({
  getPosts: vi.fn(),
  listMarkers: vi.fn(),
  setMarker: vi.fn(),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listGroups: vi.fn(() => Promise.resolve({ groups: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  listTopics: vi.fn(() =>
    Promise.resolve({
      topics: [
        {
          id: 't1',
          name: 'Practice',
          description: 'What works.',
          created_at: 1,
          post_count: 2,
          follower_count: 1,
          following: false,
        },
      ],
    }),
  ),
  followTopic: vi.fn((id: string, on: boolean) =>
    Promise.resolve({
      id,
      name: 'Practice',
      description: 'What works.',
      created_at: 1,
      post_count: 2,
      follower_count: on ? 2 : 1,
      following: on,
    }),
  ),
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

/**
 * Filtering the feed to one topic (architecture.md, Topics). The feed shows
 * only that topic, its header shows the topic's name, and Subscribe follows
 * the topic.
 */
describe('PostsPane filtered to a topic', () => {
  it('fetches only that topic, shows its name above the composer, and follows it on Subscribe', async () => {
    const { getPosts, followTopic } = await import('../api')
    const { PostsPane } = await import('./PostsPane')
    const { fireEvent } = await import('@testing-library/react')
    renderWithQuery(<PostsPane groupId={ROOT} topicId="t1" watching={false} />)
    await screen.findByText('p20')
    expect(getPosts).toHaveBeenCalledWith(ROOT, null, 20, 't1')
    const showing = await screen.findByRole('button', { name: 'Showing' })
    expect(showing.textContent).toContain('Practice')
    await screen.findByText('What works.')
    const notify = screen.getByRole('button', { name: 'Subscribe' })
    expect(notify.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(notify)
    expect(followTopic).toHaveBeenCalledWith('t1', true)
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribed' }).getAttribute('aria-pressed')).toBe('true'),
    )
    // In a topic view, a new post gets the current topic, so there is no topic chooser beside Post.
    expect(screen.queryByRole('button', { name: 'Topic' })).toBeNull()
  })

  it('shows Everything at the top of the feed, with no Subscribe button, when no topic is set', async () => {
    const { getPosts } = await import('../api')
    await draw(false)
    expect(getPosts).toHaveBeenCalledWith(ROOT, null, 20, null)
    expect((await screen.findByRole('button', { name: 'Showing' })).textContent).toContain('Everything')
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull()
    // The composer has no topic control. A post gets the topic the feed is filtered to (Raphael, 2026-11-08).
    expect(screen.queryByRole('button', { name: 'Topic' })).toBeNull()
  })
})
