// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithQuery, report, user } from '../test-utils'

/**
 * The Reports card on the Community page. The owner and moderators see one entry per
 * reported item: its author and place, the copy of its body, and who reported it and why. Open, Message, Dismiss
 * report and Delete act on the entry.
 */
vi.mock('../api', () => ({
  listReports: vi.fn(),
  closeReport: vi.fn(() => Promise.resolve()),
  openDM: vi.fn(() => Promise.resolve({ id: 'dm1' })),
  getMe: vi.fn(() => Promise.resolve({ id: 'raphael', username: 'raphael', picture: null })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

async function draw(reports: ReturnType<typeof report>[]) {
  const { listReports } = await import('../api')
  vi.mocked(listReports).mockResolvedValue({ reports })
  const { ReportsCard } = await import('./ReportsCard')
  renderWithQuery(<ReportsCard />)
}

const entry = (text: string) => screen.getByText(text).closest('li')!
/** Waits for an entry's copy to show, and returns the text, for entry(). */
const shown = async (text: string) => (await screen.findByText(text)).textContent!

describe('ReportsCard', () => {
  it('says when nothing has been reported', async () => {
    await draw([])
    expect(await screen.findByText('Nothing has been reported.')).toBeTruthy()
  })

  it('shows the author, the place, the copy, each reporter and reason, and the actions in order', async () => {
    await draw([
      report('post', 'p1', {
        reports: [
          { reporter: user('mo'), reason: 'Spam link', created_at: 1 },
          { reporter: user('jo'), reason: '', created_at: 2 },
        ],
      }),
    ])
    const li = within(entry(await shown('p1 was reported')))
    // The Message button shows once the signed-in user is known, which is how it knows the author is someone else.
    await li.findByRole('button', { name: 'Message author' })
    expect(li.getByText('Post in Home')).toBeTruthy()
    expect(li.getByText('Spam link')).toBeTruthy()
    expect(li.getAllByText(/^Reported by/).map((e) => e.textContent?.replace(/ ·.*/, ''))).toEqual([
      'Reported by mo',
      'Reported by jo',
    ])
    expect(
      li
        .getAllByRole('button')
        .map((b) => b.textContent)
        .filter((t) => t && !['kit', 'mo', 'jo'].includes(t)),
    ).toEqual(['Open', 'Message author', 'Dismiss report', 'Delete post'])
  })

  it('opens a post, a comment on its post, and a chat message in its chat', async () => {
    await draw([
      report('post', 'p1'),
      report('comment', 'c1', { post_id: 'p9' }),
      report('message', 'm1', { group_id: 'knit', group_kind: 'group', group_name: 'Knitting' }),
    ])
    fireEvent.click(within(entry(await shown('p1 was reported'))).getByRole('button', { name: 'Open' }))
    expect(window.location.pathname).toBe('/p/p1')
    fireEvent.click(within(entry('c1 was reported')).getByRole('button', { name: 'Open' }))
    expect(window.location.pathname).toBe('/p/p9')
    expect(within(entry('m1 was reported')).getByText('Message in Knitting')).toBeTruthy()
    fireEvent.click(within(entry('m1 was reported')).getByRole('button', { name: 'Open' }))
    expect(window.location.pathname + window.location.search).toBe('/r/knit?message=m1')
  })

  it('offers no Open for a conversation or an item the viewer cannot see, and names the delete by kind', async () => {
    await draw([report('message', 'm1', { group_id: 'dm', group_kind: 'dm', can: { open: false } })])
    const li = within(entry(await shown('m1 was reported')))
    expect(li.getByText('Message in a conversation')).toBeTruthy()
    expect(li.queryByRole('button', { name: 'Open' })).toBeNull()
    expect(li.getByRole('button', { name: 'Delete message' })).toBeTruthy()
  })

  it('says when the item has been deleted since, and then offers only Message and Dismiss report', async () => {
    await draw([report('post', 'p1', { deleted: true, can: { open: false } })])
    const li = within(entry(await shown('p1 was reported')))
    expect(li.getByText('The post has since been deleted.')).toBeTruthy()
    expect(li.queryByRole('button', { name: 'Delete post' })).toBeNull()
    expect(li.getByRole('button', { name: 'Dismiss report' })).toBeTruthy()
  })

  it("names a deleted room as a deleted room, because the server empties a deleted room's name", async () => {
    await draw([
      report('post', 'p1', {
        group_id: 'knit',
        group_kind: 'group',
        group_name: '',
        deleted: true,
        can: { open: false },
      }),
    ])
    expect(within(entry(await shown('p1 was reported'))).getByText('Post in a deleted room')).toBeTruthy()
  })

  it('dismisses the reports of an item and removes the entry', async () => {
    const { closeReport } = await import('../api')
    await draw([report('post', 'p1')])
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss report' }))
    expect(closeReport).toHaveBeenCalledWith('post', 'p1', 'dismiss')
    await waitFor(() => expect(screen.queryByText('p1 was reported')).toBeNull())
    expect(screen.getByText('Nothing has been reported.')).toBeTruthy()
  })

  it('deletes the item after a confirmation', async () => {
    const { closeReport } = await import('../api')
    await draw([report('comment', 'c1')])
    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }))
    expect(closeReport).not.toHaveBeenCalled()
    const dialog = within(screen.getByRole('dialog', { hidden: true }))
    expect(dialog.getByRole('heading', { name: 'Delete this comment?', hidden: true })).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Delete comment', hidden: true }))
    expect(closeReport).toHaveBeenCalledWith('comment', 'c1', 'delete')
    await waitFor(() => expect(screen.queryByText('c1 was reported')).toBeNull())
  })

  it('opens a conversation with the author, and offers none when the author is the viewer', async () => {
    const { openDM } = await import('../api')
    await draw([report('post', 'p1'), report('post', 'p2', { author: user('raphael') })])
    fireEvent.click(await screen.findByRole('button', { name: 'Message author' }))
    expect(openDM).toHaveBeenCalledWith('kit')
    await waitFor(() => expect(window.location.pathname).toBe('/r/dm1'))
    expect(within(entry('p2 was reported')).queryByRole('button', { name: 'Message author' })).toBeNull()
  })
})
