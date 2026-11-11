// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

/**
 * Reporting a post, comment or message. The dialog says who will see the item, takes
 * an optional reason, sends the report, and then says it was sent.
 */
vi.mock('../api', () => ({ createReport: vi.fn(() => Promise.resolve()) }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const dialog = () => within(screen.getByRole('dialog', { hidden: true }))

describe('ReportDialog', () => {
  it('sends the kind, the id and the trimmed reason, then says the report was sent', async () => {
    const { createReport } = await import('../api')
    const { ReportDialog } = await import('./ReportDialog')
    const onClose = vi.fn()
    render(<ReportDialog kind="post" id="p1" author="kit" open onClose={onClose} />)
    expect(dialog().getByRole('heading', { name: 'Report this post?', hidden: true })).toBeTruthy()
    expect(dialog().getByText(/^Moderators look after the community\./).textContent).toBe(
      'Moderators look after the community. They will see this post and your report text. kit will not be told who reported it.',
    )
    fireEvent.change(dialog().getByLabelText("What's wrong?"), { target: { value: '  Spam link  ' } })
    fireEvent.click(dialog().getByRole('button', { name: 'Report post', hidden: true }))
    expect(createReport).toHaveBeenCalledWith('post', 'p1', 'Spam link')
    expect(await dialog().findByRole('heading', { name: 'Post reported', hidden: true })).toBeTruthy()
    expect(dialog().queryByText('Thank you. The moderators will look at it.')).toBeNull()
    expect(dialog().queryByRole('button', { name: 'Cancel', hidden: true })).toBeNull()
    fireEvent.click(dialog().getByRole('button', { name: 'Done', hidden: true }))
    expect(onClose).toHaveBeenCalled()
  })

  it('says that moderators will see a message in a conversation, although they cannot read conversations', async () => {
    const { ReportDialog } = await import('./ReportDialog')
    render(<ReportDialog kind="message" id="m1" author="kit" conversation open onClose={vi.fn()} />)
    expect(dialog().getByText(/^Moderators look after the community\./).textContent).toBe(
      'Moderators look after the community. They cannot read private conversations, but they will see this message and your report text. kit will not be told who reported it.',
    )
    expect(dialog().getByRole('button', { name: 'Report message', hidden: true })).toBeTruthy()
  })

  it('shows the error and keeps the form when the report fails', async () => {
    const { createReport } = await import('../api')
    vi.mocked(createReport).mockRejectedValueOnce(new Error('No such comment'))
    const { ReportDialog } = await import('./ReportDialog')
    render(<ReportDialog kind="comment" id="c1" author="kit" open onClose={vi.fn()} />)
    fireEvent.click(dialog().getByRole('button', { name: 'Report comment', hidden: true }))
    expect(await dialog().findByText('No such comment')).toBeTruthy()
    expect(dialog().getByRole('heading', { name: 'Report this comment?', hidden: true })).toBeTruthy()
  })
})
