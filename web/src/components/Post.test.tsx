// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { mine, nobody, post, renderWithQuery, user } from '../test-utils'

/** A post's menu shows exactly what its can flags allow; nothing is decided here. */
vi.mock('../api', () => ({ listUsers: vi.fn(() => Promise.resolve({ users: [] })) }))

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
