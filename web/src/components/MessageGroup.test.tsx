// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { message, nobody, renderWithQuery, reportable, user } from '../test-utils'

/** A chat message offers Delete only when its can flag allows it, and asks for confirmation first. */
vi.mock('../api', () => ({
  getFrequentReactions: vi.fn(() => Promise.resolve({ emoji: [] })),
  getMe: vi.fn(() => Promise.resolve({ id: 'kit', username: 'kit', picture: null })),
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

afterEach(cleanup)

describe('MessageGroup replies', () => {
  it('shows a quote of the message a reply answers, says when it was deleted, and offers Reply on every message', async () => {
    const { MessageGroup } = await import('./MessageGroup')
    const onReply = vi.fn()
    const onJump = vi.fn()
    renderWithQuery(
      <MessageGroup
        messages={[
          message('m3', user('mo'), {
            reply_to: { id: 'm1', author: user('kit'), text: 'Who has the projector?', deleted: false },
          }),
          message('m4', user('mo'), { reply_to: { id: 'm2', author: null, text: '', deleted: true } }),
        ]}
        onDelete={() => Promise.resolve()}
        onReply={onReply}
        onJump={onJump}
      />,
    )
    const quote = screen.getByRole('button', { name: /kit: Who has the projector\?/ })
    fireEvent.click(quote)
    expect(onJump).toHaveBeenCalledWith('m1')
    expect(screen.getByText('Message deleted')).toBeTruthy()
    const replies = screen.getAllByRole('button', { name: 'Reply to this message' })
    expect(replies).toHaveLength(2)
    fireEvent.click(replies[0])
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'm3' }))
  })
})

describe('MessageGroup', () => {
  it('offers Delete only on messages the server allows, and confirms before deleting', async () => {
    const { MessageGroup } = await import('./MessageGroup')
    const onDelete = vi.fn(() => Promise.resolve())
    renderWithQuery(
      <MessageGroup
        messages={[
          message('m1', user('mo'), { can: { edit: false, delete: true, report: false } }),
          message('m2', user('mo'), { can: nobody }),
        ]}
        onDelete={onDelete}
      />,
    )
    expect(screen.getAllByLabelText('Message options')).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('Message options'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('m1')
  })

  it("offers Report on another member's message, which opens the report dialog for the message", async () => {
    const { MessageGroup } = await import('./MessageGroup')
    renderWithQuery(<MessageGroup messages={[message('m1', user('mo'), { can: reportable })]} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Message options'))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Report'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report' }))
    expect(screen.getByRole('heading', { name: 'Report this message?', hidden: true })).toBeTruthy()
  })
})
