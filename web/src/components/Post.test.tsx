// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import type { Can } from '../api'
import { mine, nobody, post, renderWithQuery, reportable, user } from '../test-utils'

/** A post's menu shows exactly the actions its can flags allow. The component makes no permission decisions. */
vi.mock('../api', () => ({
  getMe: vi.fn(() => Promise.resolve({ id: 'kit', username: 'kit', picture: null })),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  listTopics: vi.fn(() =>
    Promise.resolve({
      topics: [
        {
          id: 't1',
          name: 'Practice',
          description: 'What works.',
          created_at: 1,
          post_count: 1,
          follower_count: 0,
          following: false,
        },
        {
          id: 't2',
          name: 'Reading',
          description: '',
          created_at: 1,
          post_count: 0,
          follower_count: 0,
          following: false,
        },
      ],
    }),
  ),
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
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Edit', 'Delete'])
  })
  it('offers only Delete to a user who can delete but not edit', async () => {
    await render({ edit: false, delete: true, report: false })
    fireEvent.click(screen.getByLabelText('Post options'))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Delete'])
  })
  it('shows no menu when nothing is allowed', async () => {
    await render(nobody)
    expect(screen.queryByLabelText('Post options')).toBeNull()
  })
  it("offers Report on another member's post, which opens the report dialog for the post", async () => {
    await render(reportable)
    fireEvent.click(screen.getByLabelText('Post options'))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Report'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report' }))
    expect(screen.getByRole('heading', { name: 'Report this post?', hidden: true })).toBeTruthy()
  })
  it('puts Report before Delete, so the item that removes something is last', async () => {
    await render({ edit: false, delete: true, report: true })
    fireEvent.click(screen.getByLabelText('Post options'))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Report', 'Delete'])
  })
})

/**
 * The topic pill (architecture.md, Topics). For every user, it links to the
 * topic. The author changes a post's topic in the edit form.
 */
describe('Post topic pill', () => {
  async function drawFiled(flags: Can) {
    const { Post } = await import('./Post')
    const onSetTopic = vi.fn(() => Promise.resolve())
    renderWithQuery(
      <Post
        post={post('p1', user('kit'), { topic_id: 't1', can: flags })}
        disabled={false}
        onEdit={() => Promise.resolve()}
        onDelete={() => Promise.resolve()}
        onSetTopic={onSetTopic}
      />,
    )
    return onSetTopic
  }

  it('links to the topic for a reader', async () => {
    await drawFiled(nobody)
    const pill = await screen.findByRole('link', { name: 'Topic: Practice' })
    expect(pill.getAttribute('href')).toBe('/?topic=t1')
    expect(pill.textContent).toBe('Practice')
  })

  it('is also a link for the author, who changes the topic while editing the post', async () => {
    const onSetTopic = await drawFiled({ ...mine, set_topic: true })
    expect((await screen.findByRole('link', { name: 'Topic: Practice' })).getAttribute('href')).toBe('/?topic=t1')
    fireEvent.click(screen.getByLabelText('Post options'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const chooser = await screen.findByRole('button', { name: 'Topic' })
    expect(chooser.textContent).toContain('Practice')
    fireEvent.click(chooser)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Reading' }))
    expect(screen.getByRole('button', { name: 'Topic' }).textContent).toContain('Reading')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(onSetTopic).toHaveBeenCalledWith('t2'))
  })

  it('shows no pill on a post without a topic', async () => {
    const { Post } = await import('./Post')
    renderWithQuery(
      <Post
        post={post('p1', user('kit'))}
        disabled={false}
        onEdit={() => Promise.resolve()}
        onDelete={() => Promise.resolve()}
      />,
    )
    expect(screen.queryByRole('link', { name: /^Topic/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Topic/ })).toBeNull()
  })
})
