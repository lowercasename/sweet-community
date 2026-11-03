import { useRef, useState } from 'react'
import { useEditor, useEditorState, type Editor } from '@tiptap/react'
import { postExtensions } from '../editor/extensions'
import { Button, EditorSurface, Form, Row, Stack, Text } from '../ui'

interface ComposerProps {
  /** True while offline; disables submit. */
  disabled: boolean
  /** Resolves on success; rejects with an Error whose message is shown under the editor. */
  onSubmit: (bodyHtml: string) => Promise<void>
  /**
   * Edit mode: seed the editor with this stored HTML and keep it after a
   * successful submit (the parent swaps the editor out). Create mode clears.
   */
  initialHtml?: string
  submitLabel?: string
  /** Edit mode only: shown as a Cancel button and bound to Escape. */
  onCancel?: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/** Mod+K: prompt for a URL and set/unset the link mark on the selection. */
function promptLink(editor: Editor) {
  const previous = (editor.getAttributes('link').href as string | undefined) ?? ''
  const href = window.prompt('Link URL', previous)
  if (href === null) return
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href.trim() === '') chain.unsetLink().run()
  else chain.setLink({ href: href.trim() }).run()
}

export function Composer({ disabled, onSubmit, initialHtml, submitLabel, onCancel }: ComposerProps) {
  const editing = initialHtml !== undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The keydown handler is created once by TipTap; read the latest callbacks via refs.
  const submitRef = useRef<() => void>(() => {})
  const cancelRef = useRef<(() => void) | undefined>(onCancel)
  cancelRef.current = onCancel

  const editor = useEditor({
    extensions: postExtensions,
    content: initialHtml ?? '',
    autofocus: editing ? 'end' : false,
    editorProps: {
      handleKeyDown(_view, event) {
        const modKey = event.metaKey || event.ctrlKey
        if (modKey && event.key === 'Enter') {
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

  const isEmpty = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? editor.isEmpty : true),
  })

  const canSubmit = !!editor && !isEmpty && !disabled && !busy

  const submit = async () => {
    if (!editor || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(editor.getHTML())
      if (!editing) editor.commands.clearContent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : editing ? 'Could not save' : 'Could not post')
    } finally {
      setBusy(false)
    }
  }
  submitRef.current = () => void submit()

  const label = submitLabel ?? (editing ? 'Save' : 'Post')
  const busyLabel = editing ? 'Saving…' : 'Posting…'

  return (
    <Form onSubmit={() => void submit()}>
      <Stack gap={2}>
        <EditorSurface editor={editor} />
        <Row justify="between" align="center">
          <Text as="span" variant="small">
            Bold {mod}B · Italic {mod}I · Link {mod}K · {label} {mod}Enter{onCancel ? ' · Cancel Esc' : ''}
          </Text>
          <Row gap={2} align="center">
            {onCancel && (
              <Button variant="quiet" disabled={busy} onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={!canSubmit}>
              {busy ? busyLabel : label}
            </Button>
          </Row>
        </Row>
        {error && <Text variant="secondary">{error}</Text>}
      </Stack>
    </Form>
  )
}
