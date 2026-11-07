// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { mine, nobody, post, renderWithQuery, user } from '../test-utils'

/** A post's menu shows exactly what its can flags allow; nothing is decided here. */
vi.mock('../api', () => ({
  getMe: vi.fn(() => Promise.resolve({ id: 'kit', username: 'kit', picture: null })),
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

async function render(flags: { edit: boolean; delete: boolean }) {
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
  it("links its time to the post's own page, unless told it is already there", async () => {
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
  it('offers only Delete to someone who may delete but not edit', async () => {
    await render({ edit: false, delete: true })
    fireEvent.click(screen.getByLabelText('Post options'))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Delete'])
  })
  it('shows no menu when nothing is allowed', async () => {
    await render(nobody)
    expect(screen.queryByLabelText('Post options')).toBeNull()
  })
})

/** The topic pill (architecture.md, Topics): a way in for a reader, the way to file it for its author and the staff. */
describe('Post topic pill', () => {
  async function drawFiled(flags: { edit: boolean; delete: boolean; set_topic?: boolean }) {
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

  it('opens the topic for a reader', async () => {
    await drawFiled(nobody)
    const pill = await screen.findByRole('link', { name: 'Topic: Practice' })
    expect(pill.getAttribute('href')).toBe('/?topic=t1')
    expect(pill.textContent).toBe('Practice')
  })

  it('is a link for its author too, who changes the topic while editing', async () => {
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
