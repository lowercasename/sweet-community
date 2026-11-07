// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithQuery } from '../test-utils'

/** The owner's list of topics (architecture.md, Topics): add, rename, delete, and what delete does, said with the numbers. */
vi.mock('../api', () => ({
  listTopics: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  deleteTopic: vi.fn(() => Promise.resolve()),
}))

const practice = {
  id: 't1',
  name: 'Practice',
  description: 'What works.',
  created_at: 1,
  post_count: 38,
  follower_count: 22,
  following: false,
}
const hangout = { ...practice, id: 't2', name: 'hangout', description: '', post_count: 0, follower_count: 0 }

afterEach(cleanup)
beforeEach(async () => {
  const { listTopics, createTopic, updateTopic } = await import('../api')
  vi.mocked(listTopics).mockResolvedValue({ topics: [hangout, practice] })
  vi.mocked(createTopic).mockImplementation((name, description) =>
    Promise.resolve({ ...practice, id: 't3', name, description, post_count: 0, follower_count: 0 }),
  )
  vi.mocked(updateTopic).mockImplementation((id, name, description) =>
    Promise.resolve({ ...practice, id, name, description }),
  )
})

async function draw() {
  const { TopicsCard } = await import('./TopicsCard')
  renderWithQuery(<TopicsCard />)
  await screen.findByText('Practice')
}

describe('TopicsCard', () => {
  it('lists the topics with their counts and adds one, trimmed', async () => {
    const { createTopic } = await import('../api')
    await draw()
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].textContent).toMatch(/^hangout/)
    expect(rows[1].textContent).toMatch(/^Practice/)
    expect(rows[1].textContent).toContain('38 posts')
    expect(rows[1].textContent).toContain('22 subscribers')
    fireEvent.change(screen.getByLabelText('Topic name'), { target: { value: '  Reading ' } })
    fireEvent.change(screen.getByLabelText('Short description'), { target: { value: ' Papers. ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add topic' }))
    expect(createTopic).toHaveBeenCalledWith('Reading', 'Papers.')
    await screen.findByText('Reading')
    expect((screen.getByLabelText('Topic name') as HTMLInputElement).value).toBe('')
  })

  it('renames in place', async () => {
    const { updateTopic } = await import('../api')
    await draw()
    fireEvent.click(screen.getByRole('button', { name: 'Options for Practice' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const name = screen.getByDisplayValue('Practice')
    fireEvent.change(name, { target: { value: 'Practice notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateTopic).toHaveBeenCalledWith('t1', 'Practice notes', 'What works.')
    await screen.findByText('Practice notes')
  })

  it('deletes after saying what happens to the posts and the people', async () => {
    const { deleteTopic } = await import('../api')
    await draw()
    fireEvent.click(screen.getByRole('button', { name: 'Options for Practice' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Its 38 posts stay, without a topic.')
    expect(dialog.textContent).toContain('Its 22 subscribers will no longer be notified.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(deleteTopic).toHaveBeenCalledWith('t1')
    await vi.waitFor(() => expect(screen.queryByText('Practice')).toBeNull())
  })

  it('explains what a topic is before any exist', async () => {
    const { listTopics } = await import('../api')
    vi.mocked(listTopics).mockResolvedValue({ topics: [] })
    const { TopicsCard } = await import('./TopicsCard')
    renderWithQuery(<TopicsCard />)
    await screen.findByText(/Topics are always optional/)
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
