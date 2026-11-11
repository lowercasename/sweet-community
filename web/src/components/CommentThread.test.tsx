// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ROOT, comment, mine, nobody, renderWithQuery, reportable, user } from '../test-utils'

/**
 * The menu on a comment shows exactly the actions that the server's can flags
 * allow. The component has no permission rules of its own. Deleting asks for
 * confirmation, then removes the comment from the thread.
 */
vi.mock('../api', () => ({
  getComments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(() => Promise.resolve()),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  getMe: vi.fn(() => Promise.resolve({ id: 'kit', username: 'kit', picture: null })),
}))

const kit = user('kit')
const mo = user('mo')

afterEach(cleanup)

beforeEach(async () => {
  const { getComments } = await import('../api')
  vi.mocked(getComments).mockResolvedValue({
    comments: [
      comment('c-kit', 'p1', kit, { can: { edit: false, delete: true, report: true } }), // The viewer is the post's author.
      comment('c-mo', 'p1', mo, { can: mine }), // The viewer is mo.
      comment('c-jo', 'p1', user('jo'), { can: nobody }),
      comment('c-bo', 'p1', user('bo'), { can: reportable }),
    ],
    next_before: null,
  })
})

async function thread() {
  const { CommentThread } = await import('./CommentThread')
  renderWithQuery(<CommentThread postId="p1" groupId={ROOT} replyTo="kit" disabled={false} />)
  await screen.findByText('c-jo says hi')
}

const menuOf = (text: string) => within(screen.getByText(text).closest('article')!).queryByLabelText('Comment options')

describe('CommentThread', () => {
  it('shows which user the reply editor replies to', async () => {
    await thread()
    expect(document.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')).toBe('Reply to kit…')
  })

  it('shows a menu with exactly the actions the can flags allow', async () => {
    await thread()
    fireEvent.click(menuOf('c-mo says hi')!)
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Edit', 'Delete'])
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.click(menuOf('c-kit says hi')!)
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Report', 'Delete'])
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.click(menuOf('c-bo says hi')!)
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Report'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report' }))
    expect(screen.getByRole('heading', { name: 'Report this comment?', hidden: true })).toBeTruthy()
    expect(menuOf('c-jo says hi')).toBeNull()
  })

  it('asks for confirmation before deleting, then removes the comment', async () => {
    const { deleteComment } = await import('../api')
    await thread()
    fireEvent.click(menuOf('c-mo says hi')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(deleteComment).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(deleteComment).toHaveBeenCalledWith('c-mo')
    await vi.waitFor(() => expect(screen.queryByText('c-mo says hi')).toBeNull())
    expect(screen.getByText('c-kit says hi')).toBeTruthy()
  })

  it('shows Load earlier comments when the thread has more, and loads them above', async () => {
    const { getComments } = await import('../api')
    vi.mocked(getComments).mockReset()
    vi.mocked(getComments)
      .mockResolvedValueOnce({ comments: [comment('c-new', 'p1', mo, { created_at: 20 })], next_before: 20 })
      .mockResolvedValueOnce({ comments: [comment('c-old', 'p1', kit, { created_at: 10 })], next_before: null })
    const { CommentThread } = await import('./CommentThread')
    renderWithQuery(<CommentThread postId="p1" groupId={ROOT} replyTo="kit" disabled={false} />)
    await screen.findByText('c-new says hi')
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier comments' }))
    await screen.findByText('c-old says hi')
    expect(getComments).toHaveBeenLastCalledWith('p1', 20)
    const shown = screen.getAllByText(/says hi/).map((e) => e.textContent)
    expect(shown).toEqual(['c-old says hi', 'c-new says hi'])
    expect(screen.queryByRole('button', { name: 'Load earlier comments' })).toBeNull()
  })
})
