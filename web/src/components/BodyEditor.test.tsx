// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { postExtensions } from '../editor/extensions'
import { ROOT, member, mentionSpan, paragraph, user } from '../test-utils'
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
    const editorIn = (container: HTMLElement) =>
      (container.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
    const typed = (container: HTMLElement, html: string) =>
      editorIn(container).commands.setContent(html, { emitUpdate: true })
    const text = (container: HTMLElement) => container.querySelector('.ProseMirror')?.textContent

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
      await waitFor(() => expect(view.container.querySelector('.ProseMirror')).not.toBeNull())
      return { ...view, onSubmit }
    }

    it('opens with its saved draft, saves what is typed, and deletes the draft when it is sent', async () => {
      saveDraft('kit', 'post:home', paragraph('Saved earlier'))
      const { container, onSubmit } = await editor({ draft: 'post:home' })
      expect(text(container)).toBe('Saved earlier')
      typed(container, paragraph('Written now'))
      expect(loadDraft('kit', 'post:home')).toBe(paragraph('Written now'))
      fireEvent.click(screen.getByRole('button', { name: 'Post' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(paragraph('Written now')))
      await waitFor(() => expect(loadDraft('kit', 'post:home')).toBeNull())
      expect(text(container)).toBe('')
    })

    it('shows the same text in two editors with the same draft, such as a thread on Home and on its post page', async () => {
      const first = await editor({ draft: 'comment:p1' })
      const second = await editor({ draft: 'comment:p1' })
      typed(first.container, paragraph('Typed in the first'))
      await waitFor(() => expect(text(second.container)).toBe('Typed in the first'))
      typed(second.container, paragraph('Typed in the second'))
      await waitFor(() => expect(text(first.container)).toBe('Typed in the second'))
      expect(loadDraft('kit', 'comment:p1')).toBe(paragraph('Typed in the second'))
    })

    it('shows the stored text again in a second open edit when the first one is cancelled', async () => {
      const first = await editor({ draft: 'post-edit:p1', initialHtml: paragraph('Stored'), onCancel: vi.fn() })
      const second = await editor({ draft: 'post-edit:p1', initialHtml: paragraph('Stored'), onCancel: vi.fn() })
      typed(first.container, paragraph('Changed'))
      await waitFor(() => expect(text(second.container)).toBe('Changed'))
      fireEvent.click(within(second.container).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(text(first.container)).toBe('Stored'))
    })

    it('opens an edit with its draft in place of the stored text, and Cancel deletes the draft', async () => {
      saveDraft('kit', 'post-edit:p1', paragraph('Half an edit'))
      const onCancel = vi.fn()
      const { container } = await editor({ draft: 'post-edit:p1', initialHtml: paragraph('Stored'), onCancel })
      expect(text(container)).toBe('Half an edit')
      typed(container, paragraph('More of the edit'))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onCancel).toHaveBeenCalled()
      expect(loadDraft('kit', 'post-edit:p1')).toBeNull()
    })

    it('deletes the draft when an edit is saved, although the editor keeps the text', async () => {
      const { container } = await editor({ draft: 'post-edit:p1', initialHtml: paragraph('Stored'), onCancel: vi.fn() })
      typed(container, paragraph('Edited'))
      expect(loadDraft('kit', 'post-edit:p1')).toBe(paragraph('Edited'))
      fireEvent.click(screen.getByRole('button', { name: 'Post' }))
      await waitFor(() => expect(loadDraft('kit', 'post-edit:p1')).toBeNull())
      expect(text(container)).toBe('Edited')
    })
  })
})

it('updates visible mentions from community identities without replacing the editor', async () => {
  const { BodyEditor } = await import('./BodyEditor')
  const qc = makeQueryClient()
  qc.setQueryData(keys.me, user('kit'))
  qc.setQueryData(keys.users, { users: [{ ...member('jo'), username: 'joseph' }] })
  qc.setQueryData(keys.members(ROOT), { members: [] })
  const { container } = render(
    <QueryClientProvider client={qc}>
      <BodyEditor
        groupId={ROOT}
        extensions={postExtensions}
        size="post"
        submitLabel="Save"
        disabled={false}
        onSubmit={() => Promise.resolve()}
        initialHtml={paragraph(`Draft ${mentionSpan('jo', 'old')}`)}
      />
    </QueryClientProvider>,
  )
  const element = container.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }
  await waitFor(() => expect(element.textContent).toBe('Draft @joseph'))
  const selection = element.editor.state.selection.from
  qc.setQueryData(keys.users, { users: [{ ...member('jo'), username: 'josephine' }] })
  await waitFor(() => expect(element.textContent).toBe('Draft @josephine'))
  expect(container.querySelector('.ProseMirror')).toBe(element)
  expect(element.editor.state.selection.from).toBe(selection)
  expect(element.editor.getHTML()).toContain('@josephine')
})
