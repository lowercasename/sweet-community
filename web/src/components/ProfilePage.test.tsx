// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { ROOT, group, paragraph, post, renderWithQuery, user } from '../test-utils'
import type { Profile } from '../api'

/**
 * A person's page (architecture.md, Accounts): who they are, a bio they
 * alone edit, a way to message them, and their posts from the rooms I share.
 */
vi.mock('../api', async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import('../api')>()).ApiError,
  getProfile: vi.fn(),
  getUserPosts: vi.fn(),
  setBio: vi.fn(),
  openDM: vi.fn(),
  listGroups: vi.fn(() => Promise.resolve({ groups: [] })),
  listTopics: vi.fn(() => Promise.resolve({ topics: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  getComments: vi.fn(() => Promise.resolve({ comments: [] })),
  listMarkers: vi.fn(() => Promise.resolve({ markers: [] })),
}))

const raphael = user('raphael')
const kit = user('kit')
const profile = (u = kit, extra: Partial<Profile> = {}): Profile => ({
  ...u,
  role: 'member',
  joined_at: 5,
  bio_html: paragraph('I knit'),
  can: { edit: false },
  ...extra,
})

afterEach(cleanup)

beforeEach(async () => {
  const { getProfile, getUserPosts, listGroups } = await import('../api')
  vi.mocked(getProfile).mockResolvedValue(profile())
  vi.mocked(getUserPosts).mockResolvedValue({
    posts: [post('p2', kit, { group_id: 'knit' }), post('p1', kit)],
    next_before: null,
  })
  vi.mocked(listGroups).mockResolvedValue({
    groups: [group(ROOT, 'member'), group('knit', 'member', { name: 'Knitting' })],
  })
})

async function draw(name = 'kit') {
  const { ProfilePage } = await import('./ProfilePage')
  const onGo = vi.fn()
  renderWithQuery(<ProfilePage name={name} me={raphael} onGo={onGo} />)
  return onGo
}

describe('ProfilePage', () => {
  it("shows who they are, their bio, Message, and their posts with each post's room", async () => {
    const { openDM } = await import('../api')
    vi.mocked(openDM).mockResolvedValue(group('d1', 'member', { kind: 'dm' }))
    const onGo = await draw()
    await screen.findByRole('heading', { name: 'kit' })
    expect(screen.getByText('I knit')).toBeTruthy()
    expect(screen.getByText(/joined/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /bio/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
    await screen.findByText('p2')
    expect(screen.getAllByRole('article')).toHaveLength(2)
    await screen.findByText('Posted in')
    expect(screen.getByRole('link', { name: 'Knitting' }).getAttribute('href')).toBe('/r/knit')
    fireEvent.click(screen.getByRole('button', { name: 'Message' }))
    expect(openDM).toHaveBeenCalledWith('kit')
    await vi.waitFor(() => expect(onGo).toHaveBeenCalledWith('/r/d1'))
  })

  it('on my own page: edit the bio, and Settings is here', async () => {
    const { getProfile, setBio } = await import('../api')
    vi.mocked(getProfile).mockResolvedValue(profile(raphael, { bio_html: '', can: { edit: true } }))
    vi.mocked(setBio).mockResolvedValue(profile(raphael, { bio_html: paragraph('Hello'), can: { edit: true } }))
    const onGo = await draw('raphael')
    await screen.findByText('Nothing about you yet.')
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Write a bio' }))
    expect(document.querySelector('.ProseMirror')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onGo).toHaveBeenCalledWith('/settings')
  })

  it('says so when there is nobody of that name', async () => {
    const { getProfile, ApiError } = await import('../api')
    vi.mocked(getProfile).mockRejectedValue(new ApiError(404, 'no such person'))
    await draw('nobody')
    await screen.findByText(/nobody here by that name/)
  })
})
