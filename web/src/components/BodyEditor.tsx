import { useRef, useState } from 'react'
import { useEditor, useEditorState, type Extensions } from '@tiptap/react'
import { Button, EditorSurface, Form, Row, Stack, Text } from '../ui'
import { EditorToolbar, promptLink } from './EditorToolbar'

interface BodyEditorProps {
  extensions: Extensions
  /** `post` is a tall box; `line` starts one line high and grows. */
  size: 'post' | 'line'
  /** Enter submits (chat). Otherwise Enter is a newline and Mod+Enter submits. */
  enterSubmits?: boolean
  submitLabel: string
  busyLabel: string
  /** True while offline; disables submit. */
  disabled: boolean
  /** Resolves on success; rejects with an Error whose message is shown under the editor. */
  onSubmit: (bodyHtml: string) => Promise<void>
  /**
   * Edit mode: seed the editor with this stored HTML and keep it after a
   * successful submit (the parent swaps the editor out). Create mode clears.
   */
  initialHtml?: string
  /** Edit mode only: shown as a Cancel button and bound to Escape. */
  onCancel?: () => void
}

/** The one editor: posts, chat and comments differ only in schema, size and submit key. */
export function BodyEditor({
  extensions,
  size,
  enterSubmits = false,
  submitLabel,
  busyLabel,
  disabled,
  onSubmit,
  initialHtml,
  onCancel,
}: BodyEditorProps) {
  const editing = initialHtml !== undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The keydown handler is created once by TipTap; read the latest callbacks via refs.
  const submitRef = useRef<() => void>(() => {})
  const cancelRef = useRef<(() => void) | undefined>(onCancel)
  cancelRef.current = onCancel

  const editor = useEditor({
    extensions,
    content: initialHtml ?? '',
    autofocus: editing ? 'end' : false,
    editorProps: {
      handleKeyDown(_view, event) {
        const modKey = event.metaKey || event.ctrlKey
        if (event.key === 'Enter' && (enterSubmits ? !event.shiftKey : modKey)) {
          event.preventDefault()
          submitRef.current()
          return true
        }
        if (modKey && (event.key === 'k' || event.key === 'K')) {
          event.preventDefault()
          if (editor) promptLink(editor)
          return true
        }
        if (event.key === 'Escape' && cancelRef.current) {
          event.preventDefault()
          cancelRef.current()
          return true
        }
        return false
      },
    },
  })

  const isEmpty = useEditorState({ editor, selector: ({ editor }) => (editor ? editor.isEmpty : true) })
  const canSubmit = !!editor && !isEmpty && !disabled && !busy

  const submit = async () => {
    if (!editor || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(editor.getHTML())
      if (!editing) {
        editor.commands.clearContent(true)
        if (enterSubmits) editor.commands.focus()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${submitLabel.toLowerCase()}`)
    } finally {
      setBusy(false)
    }
  }
  submitRef.current = () => void submit()

  return (
    <Form onSubmit={() => void submit()}>
      <Stack gap={size === 'line' ? 1 : 2}>
        <EditorSurface editor={editor} size={size} />
        <Row justify="between" align="center">
          <EditorToolbar editor={editor} />
          <Row gap={3} align="center">
            {onCancel && (
              <Button variant="ghost" disabled={busy} onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={!canSubmit}>
              {busy ? busyLabel : submitLabel}
            </Button>
          </Row>
        </Row>
        {error && <Text variant="secondary">{error}</Text>}
      </Stack>
    </Form>
  )
}
