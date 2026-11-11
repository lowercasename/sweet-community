// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { postExtensions } from '../editor/extensions'
import { ROOT, paragraph, user } from '../test-utils'
import { makeQueryClient } from '../data/client'
import { keys } from '../data/keys'
import { loadDraft, saveDraft } from '../editor/drafts'

/**
 * The editor's placeholder follows its prop after the editor has been created. Home's composer names the chosen
 * topic, and choosing another topic changes the text.
 */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(() => Promise.resolve({ users: [] })),
  getMe: vi.fn(() => Promise.resolve({ id: 'kit', username: 'kit', picture: null })),
}))

afterEach(cleanup)
afterEach(() => localStorage.clear())

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

  describe('drafts', () => {
    /** TipTap keeps its editor on the editable element, so a test can change the text as typing would. */
    const typed = (html: string) =>
      (document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor.commands.setContent(html, {
        emitUpdate: true,
      })
    const text = () => document.querySelector('.ProseMirror')?.textContent

    async function editor(props: { draft: string; initialHtml?: string; onCancel?: () => void }) {
      const { BodyEditor } = await import('./BodyEditor')
      const qc = makeQueryClient()
      qc.setQueryData(keys.me, user('kit'))
      const onSubmit = vi.fn(() => Promise.resolve())
      const view = render(
        <QueryClientProvider client={qc}>
          <BodyEditor
            groupId={ROOT}
            extensions={postExtensions}
            size="post"
            submitLabel="Post"
            disabled={false}
            onSubmit={onSubmit}
            {...props}
          />
        </QueryClientProvider>,
      )
      await waitFor(() => expect(document.querySelector('.ProseMirror')).not.toBeNull())
      return { ...view, onSubmit }
    }

    it('opens with its saved draft, saves what is typed, and deletes the draft when it is sent', async () => {
      saveDraft('kit', 'post:home', paragraph('Saved earlier'))
      const { onSubmit } = await editor({ draft: 'post:home' })
      expect(text()).toBe('Saved earlier')
      typed(paragraph('Written now'))
      await waitFor(() => expect(loadDraft('kit', 'post:home')).toBe(paragraph('Written now')))
      fireEvent.click(screen.getByRole('button', { name: 'Post' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(paragraph('Written now')))
      await waitFor(() => expect(loadDraft('kit', 'post:home')).toBeNull())
      expect(text()).toBe('')
    })

    it('saves what was typed when it closes before the draft was saved, and an unchanged copy overwrites nothing', async () => {
      const { unmount } = await editor({ draft: 'post:home' })
      typed(paragraph('Typed just before closing'))
      unmount()
      expect(loadDraft('kit', 'post:home')).toBe(paragraph('Typed just before closing'))
      // A second editor with the same draft, such as a post's thread open in two places, opens with the draft and
      // does not overwrite it when it closes unchanged.
      const second = await editor({ draft: 'post:home' })
      expect(text()).toBe('Typed just before closing')
      saveDraft('kit', 'post:home', paragraph('Typed in the other editor'))
      second.unmount()
      expect(loadDraft('kit', 'post:home')).toBe(paragraph('Typed in the other editor'))
    })

    it('opens an edit with its draft in place of the stored text, and Cancel deletes the draft', async () => {
      saveDraft('kit', 'post-edit:p1', paragraph('Half an edit'))
      const onCancel = vi.fn()
      await editor({ draft: 'post-edit:p1', initialHtml: paragraph('Stored'), onCancel })
      expect(text()).toBe('Half an edit')
      typed(paragraph('More of the edit'))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onCancel).toHaveBeenCalled()
      expect(loadDraft('kit', 'post-edit:p1')).toBeNull()
    })

    it('deletes the draft when an edit is saved, although the editor keeps the text', async () => {
      const { unmount } = await editor({ draft: 'post-edit:p1', initialHtml: paragraph('Stored'), onCancel: vi.fn() })
      typed(paragraph('Edited'))
      fireEvent.click(screen.getByRole('button', { name: 'Post' }))
      await waitFor(() => expect(loadDraft('kit', 'post-edit:p1')).toBeNull())
      // The parent closes the editor after a save. Closing it saves nothing.
      unmount()
      expect(loadDraft('kit', 'post-edit:p1')).toBeNull()
    })

    it('saves the draft when the page is hidden, before the delay has passed', async () => {
      await editor({ draft: 'message:home' })
      typed(paragraph('Switching apps'))
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      expect(loadDraft('kit', 'message:home')).toBe(paragraph('Switching apps'))
      vi.restoreAllMocks()
    })
  })
})
