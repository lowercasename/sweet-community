// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { keys } from '../data/keys'
import { member, renderWithQuery, user } from '../test-utils'
import type { Reaction } from '../api'

/**
 * The reactions on an item. Each emoji is a toggle with a count, pressed when the viewer chose it, and named by the
 * people who chose it. Choosing an emoji again removes the viewer's reaction.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  setReaction: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const kit = user('kit')
const seed = (qc: import('@tanstack/react-query').QueryClient) => {
  qc.setQueryData(keys.me, kit)
  qc.setQueryData(keys.users, { users: [member('kit'), member('jo'), member('mo')] })
}

describe('reactedLabel', () => {
  it('names the viewer first as You, and lists at most ten people', async () => {
    const { reactedLabel } = await import('./Reactions')
    const name = (id: string) => id
    expect(reactedLabel({ emoji: '👍', user_ids: ['jo'] }, name, 'kit')).toBe('jo reacted with 👍')
    expect(reactedLabel({ emoji: '👍', user_ids: ['jo', 'kit', 'mo'] }, name, 'kit')).toBe(
      'You, jo and mo reacted with 👍',
    )
    const many = Array.from({ length: 12 }, (_, i) => `u${i}`)
    expect(reactedLabel({ emoji: '🧶', user_ids: many }, name, 'kit')).toBe(
      'u0, u1, u2, u3, u4, u5, u6, u7, u8 and 3 others reacted with 🧶',
    )
  })
})

describe('quickReactions', () => {
  it("offers the viewer's most used emoji first, then common ones, six in all", async () => {
    const { quickReactions } = await import('./Reactions')
    expect(quickReactions([])).toEqual(['👍', '❤️', '😂', '😮', '😢', '🙏'])
    expect(quickReactions(['🧶', '❤️'])).toEqual(['🧶', '❤️', '👍', '😂', '😮', '😢'])
    expect(quickReactions(['🧶', '🎉', '🔥', '👀', '💯', '🌈'])).toEqual(['🧶', '🎉', '🔥', '👀', '💯', '🌈'])
  })
})

describe('Reactions', () => {
  it('shows each emoji with its count, pressed when the viewer chose it, and toggles the viewer’s reaction', async () => {
    const { setReaction } = await import('../api')
    vi.mocked(setReaction).mockResolvedValue({ id: 'p1', kind: 'post', group_id: 'g', reactions: [] })
    const { Reactions, useToggleReaction } = await import('./Reactions')
    const reactions: Reaction[] = [
      { emoji: '👍', user_ids: ['jo', 'kit'] },
      { emoji: '🧶', user_ids: ['mo'] },
    ]
    function Item() {
      const toggle = useToggleReaction()
      return <Reactions reactions={reactions} onToggle={(emoji) => void toggle('post', 'p1', reactions, emoji)} />
    }
    renderWithQuery(<Item />, seed)
    const thumbs = screen.getByRole('button', { name: 'You and jo reacted with 👍' })
    const yarn = screen.getByRole('button', { name: 'mo reacted with 🧶' })
    expect(thumbs.getAttribute('aria-pressed')).toBe('true')
    expect(thumbs.textContent).toBe('👍2')
    expect(yarn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(thumbs)
    await vi.waitFor(() => expect(setReaction).toHaveBeenCalledWith('post', 'p1', '👍', false))
    fireEvent.click(yarn)
    await vi.waitFor(() => expect(setReaction).toHaveBeenCalledWith('post', 'p1', '🧶', true))
  })

  it('draws nothing when there are no reactions', async () => {
    const { Reactions } = await import('./Reactions')
    const { container } = renderWithQuery(<Reactions reactions={[]} onToggle={() => {}} />, seed)
    expect(container.innerHTML).toBe('')
  })
})
