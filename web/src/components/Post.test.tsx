// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import type { Can } from '../api'
import { mine, nobody, post, renderWithQuery, reportable, user } from '../test-utils'

/** A post's menu shows exactly the actions its can flags allow. The component makes no permission decisions. */
vi.mock('../api', () => ({
  getPostNotificationPreference: vi.fn(() => Promise.resolve({ post_id: 'p1', following: false, muted: false })),
  getMe: vi.fn(() => Promise.resolve({ id: 'kit', username: 'kit', picture: null })),
  getFrequentReactions: vi.fn(() => Promise.resolve({ emoji: [] })),
  listMarkers: vi.fn(() => Promise.resolve({ markers: [] })),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

afterEach(cleanup)

async function render(flags: Can) {
  const { Post } = await import('./Post')
  renderWithQuery(
    <Post
      post={post('p1', user('kit'), { can: flags })}
      disabled={false}
      onEdit={() => Promise.resolve()}
      onDelete={() => Promise.resolve()}
    />,
  )
}

describe('Post page link', () => {
  it("links its time to the post's own page, unless linked is false because it is already on that page", async () => {
    const { Post } = await import('./Post')
    const draw = (linked?: boolean) =>
      renderWithQuery(
        <Post
          post={post('p1', user('kit'))}
          linked={linked}
          disabled={false}
          onEdit={() => Promise.resolve()}
          onDelete={() => Promise.resolve()}
        />,
      )
    draw()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/p/p1')
    cleanup()
    draw(false)
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('Post menu', () => {
  it('offers both actions when both are allowed', async () => {
    await render(mine)
    fireEvent.click(screen.getByLabelText('Post options'))
    await screen.findByRole('menuitem', { name: 'Follow discussion' })
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Follow discussion', 'Edit', 'Delete'])
  })
  it('offers only Delete to a user who can delete but not edit', async () => {
    await render({ edit: false, delete: true, report: false })
    fireEvent.click(screen.getByLabelText('Post options'))
    await screen.findByRole('menuitem', { name: 'Follow discussion' })
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Follow discussion', 'Delete'])
  })
  it('offers discussion preferences even without content actions', async () => {
    await render(nobody)
    fireEvent.click(screen.getByLabelText('Post options'))
    await screen.findByRole('menuitem', { name: 'Follow discussion' })
    expect(screen.queryByRole('menuitem', { name: 'Mute discussion' })).toBeNull()
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  })
  it("offers Report on another member's post, which opens the report dialog for the post", async () => {
    await render(reportable)
    fireEvent.click(screen.getByLabelText('Post options'))
    await screen.findByRole('menuitem', { name: 'Follow discussion' })
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Follow discussion', 'Report'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report' }))
    expect(screen.getByRole('heading', { name: 'Report this post?', hidden: true })).toBeTruthy()
  })
  it("marks Delete with the shield when only the viewer's role allows it, and not otherwise", async () => {
    await render({ edit: false, delete: true, report: true, delete_by_role: true })
    fireEvent.click(screen.getByLabelText('Post options'))
    await screen.findByRole('menuitem', { name: 'Follow discussion' })
    const del = screen.getByRole('menuitem', { name: 'Delete' })
    expect(del.querySelector('[data-shield]')).toBeTruthy()
    expect(del.getAttribute('aria-description')).toBe('Only owners and moderators can do this')
    cleanup()
    await render(mine)
    fireEvent.click(screen.getByLabelText('Post options'))
    await screen.findByRole('menuitem', { name: 'Follow discussion' })
    expect(screen.getByRole('menuitem', { name: 'Delete' }).querySelector('[data-shield]')).toBeNull()
  })
  it('puts Report before Delete, so the item that removes something is last', async () => {
    await render({ edit: false, delete: true, report: true })
    fireEvent.click(screen.getByLabelText('Post options'))
    await screen.findByRole('menuitem', { name: 'Follow discussion' })
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Follow discussion', 'Report', 'Delete'])
  })
})
