// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

/** Makes window.matchMedia report a mouse or trackpad (`fine`) or a touch screen. */
function pointer(fine: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(pointer: fine)' ? fine : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}
const realMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = realMatchMedia
})

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

  it('shows the Add emoji button on a device with a mouse or trackpad, and not on a touch screen', async () => {
    const { BodyEditor } = await import('./BodyEditor')
    const editor = () => (
      <QueryClientProvider client={makeQueryClient()}>
        <BodyEditor
          groupId={ROOT}
          extensions={postExtensions}
          size="line"
          submitLabel="Send"
          disabled={false}
          onSubmit={() => Promise.resolve()}
        />
      </QueryClientProvider>
    )
    pointer(true)
    render(editor())
    expect((await screen.findByRole('button', { name: 'Add emoji' })).getAttribute('aria-expanded')).toBe('false')
    cleanup()
    pointer(false)
    render(editor())
    await screen.findByRole('button', { name: 'Bold' })
    expect(screen.queryByRole('button', { name: 'Add emoji' })).toBeNull()
  })
})
