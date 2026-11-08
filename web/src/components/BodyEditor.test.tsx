// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { postExtensions } from '../editor/extensions'
import { ROOT } from '../test-utils'
import { makeQueryClient } from '../data/client'

/**
 * The editor's placeholder follows its prop after the editor has been created. Home's composer names the chosen
 * topic, and choosing another topic changes the text.
 */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
}))

afterEach(cleanup)

const shown = () => document.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')

describe('BodyEditor', () => {
  it('changes its placeholder when the prop changes, and falls back to the default without one', async () => {
    const { BodyEditor } = await import('./BodyEditor')
    const qc = makeQueryClient()
    const editor = (placeholder?: string) => (
      <QueryClientProvider client={qc}>
        <BodyEditor
          groupId={ROOT}
          extensions={postExtensions}
          size="post"
          placeholder={placeholder}
          submitLabel="Post"
          disabled={false}
          onSubmit={() => Promise.resolve()}
        />
      </QueryClientProvider>
    )
    const { rerender } = render(editor('Say something in Cool Topic…'))
    await waitFor(() => expect(shown()).toBe('Say something in Cool Topic…'))
    const element = document.querySelector('.ProseMirror')
    rerender(editor('Say something in Mayhem…'))
    await waitFor(() => expect(shown()).toBe('Say something in Mayhem…'))
    rerender(editor(undefined))
    await waitFor(() => expect(shown()).toBe('What would you like to say?'))
    // The text the user has typed is kept, because the editor is the same one.
    expect(document.querySelector('.ProseMirror')).toBe(element)
  })
})
