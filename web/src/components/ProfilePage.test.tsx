// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { ROOT, group, member, paragraph, post, renderWithQuery, user } from '../test-utils'
import type { Member, Profile } from '../api'

/**
 * A user's profile page. It shows the user's
 * details, a bio that only they can edit, a Message button, and their posts
 * from the groups the viewer shares with them.
 */
vi.mock('../api', async (importOriginal) => ({
  getFrequentReactions: vi.fn(() => Promise.resolve({ emoji: [] })),
  ApiError: (await importOriginal<typeof import('../api')>()).ApiError,
  getProfile: vi.fn(),
  getUserPosts: vi.fn(),
  setBio: vi.fn(),
  openDM: vi.fn(),
  listGroups: vi.fn(() => Promise.resolve({ groups: [] })),
  listTopics: vi.fn(() => Promise.resolve({ topics: [] })),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  getComments: vi.fn(() => Promise.resolve({ comments: [], next_before: null })),
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
  const { getProfile, getUserPosts, listGroups, listUsers } = await import('../api')
  vi.mocked(listUsers).mockResolvedValue({ users: [] })
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
  it('moves to the new name of the user it showed, even when someone else has taken the old name', async () => {
    const { getProfile, listUsers } = await import('../api')
    const { applyEvent } = await import('../data/apply')
    vi.mocked(listUsers).mockResolvedValue({ users: [member('kit')] })
    const { ProfilePage } = await import('./ProfilePage')
    const onGo = vi.fn()
    const { qc } = renderWithQuery(<ProfilePage name="kit" me={raphael} onGo={onGo} />)
    await screen.findByText('I knit')
    // kit is renamed kat, and jo takes the name kit. The profile request answers before the users list does.
    const jo = { id: 'jo', username: 'kit', picture: null }
    vi.mocked(getProfile).mockResolvedValue(profile(jo, { bio_html: paragraph('I am jo') }))
    let finishUsers!: (value: { users: Member[] }) => void
    vi.mocked(listUsers).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUsers = resolve
        }),
    )
    applyEvent(qc, 'user', { ...kit, username: 'kat' })
    await vi.waitFor(() => expect(qc.getQueryData<{ id: string }>(['profile', 'kit'])?.id).toBe('jo'))
    expect(screen.queryByText('I am jo')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
    finishUsers({
      users: [
        { ...member('kit'), username: 'kat' },
        { ...member('jo'), username: 'kit' },
      ],
    })
    await vi.waitFor(() => expect(onGo).toHaveBeenCalledWith('/u/kat', { replace: true }))
  })

  it('does not redirect a new profile address using an identity that is still refreshing', async () => {
    const { getProfile, listUsers } = await import('../api')
    const { ProfilePage } = await import('./ProfilePage')
    vi.mocked(getProfile).mockResolvedValue(profile({ ...kit, username: 'kat' }))
    vi.mocked(listUsers).mockImplementation(() => new Promise(() => {}))
    const onGo = vi.fn()
    renderWithQuery(<ProfilePage name="kat" me={raphael} onGo={onGo} />, (qc) => {
      qc.setQueryData(['users'], { users: [member('kit')] })
      void qc.invalidateQueries({ queryKey: ['users'] })
    })
    await screen.findByText('I knit')
    expect(onGo).not.toHaveBeenCalled()
  })

  it('does not show a replacement account’s posts under the original profile', async () => {
    const { ProfilePage } = await import('./ProfilePage')
    renderWithQuery(<ProfilePage name="kit" me={raphael} onGo={vi.fn()} />, (qc) => {
      qc.setQueryData(['userPosts', 'kit'], {
        pages: [{ posts: [post('Someone else’s post', user('jo'))], next_before: null }],
        pageParams: [null],
      })
    })
    await screen.findByText('I knit')
    expect(screen.queryByText('Someone else’s post')).toBeNull()
  })

  it("shows the user's details, their bio, Message, and their posts with each post's group", async () => {
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

  it("on the viewer's own profile, lets the viewer edit the bio and links to Settings", async () => {
    const { getProfile, setBio } = await import('../api')
    vi.mocked(getProfile).mockResolvedValue(profile(raphael, { bio_html: '', can: { edit: true } }))
    vi.mocked(setBio).mockResolvedValue(profile(raphael, { bio_html: paragraph('Hello'), can: { edit: true } }))
    const onGo = await draw('raphael')
    await screen.findByText("You don't have a bio yet. Silent type, are we?")
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Write a bio' }))
    expect(document.querySelector('.ProseMirror')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onGo).toHaveBeenCalledWith('/settings')
  })

  it('shows a not-found message when no user has that name', async () => {
    const { getProfile, ApiError } = await import('../api')
    vi.mocked(getProfile).mockRejectedValue(new ApiError(404, 'no such person'))
    await draw('nobody')
    await screen.findByText(/no user with that name/)
  })
})
