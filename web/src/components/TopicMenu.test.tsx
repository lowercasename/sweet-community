// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Topic } from '../api'

/** The topic menu. For staff, the feed's menu ends with Edit topics. */
afterEach(cleanup)

const topic = (id: string, name: string): Topic => ({
  id,
  name,
  description: '',
  created_at: 1,
  post_count: 0,
  follower_count: 0,
  following: false,
})

describe('TopicMenu', () => {
  it('ends with Edit topics when it is given a way to edit them, and not otherwise', async () => {
    const { TopicMenu } = await import('./TopicMenu')
    const onEdit = vi.fn()
    const topics = [topic('a', 'Events')]
    const { rerender } = render(
      <TopicMenu
        topics={topics}
        value={null}
        onChange={() => {}}
        noneLabel="Everything"
        label="Showing"
        onEdit={onEdit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Showing' }))
    expect((await screen.findByRole('menuitem', { name: 'Edit topics' })).querySelector('[data-shield]')).toBeTruthy()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit topics' }))
    expect(onEdit).toHaveBeenCalled()
    rerender(<TopicMenu topics={topics} value={null} onChange={() => {}} noneLabel="Everything" label="Showing" />)
    fireEvent.click(screen.getByRole('button', { name: 'Showing' }))
    await screen.findByText('Events')
    expect(screen.queryByRole('menuitem', { name: 'Edit topics' })).toBeNull()
  })
})
