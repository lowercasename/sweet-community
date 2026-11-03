import { useRef, useState } from 'react'
import { useEditor, useEditorState } from '@tiptap/react'
import { chatExtensions } from '../editor/extensions'
import { Button, EditorSurface, Form, Row, Stack, Text } from '../ui'
import { EditorToolbar, promptLink } from './EditorToolbar'

interface ChatInputProps {
  /** True while offline; disables sending. */
  disabled: boolean
  /** Resolves on 201; rejects with an Error whose message is shown under the editor. */
  onSend: (bodyHtml: string) => Promise<void>
}

/** One-line chat editor. Enter sends, Shift+Enter breaks the line. */
export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sendRef = useRef<() => void>(() => {})

  const editor = useEditor({
    extensions: chatExtensions,
    editorProps: {
      handleKeyDown(_view, event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          sendRef.current()
          return true
        }
        if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
          event.preventDefault()
          if (editor) promptLink(editor)
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
  const canSend = !!editor && !isEmpty && !disabled && !busy

  const send = async () => {
    if (!editor || !canSend) return
    setBusy(true)
    setError(null)
    try {
      await onSend(editor.getHTML())
      editor.commands.clearContent(true)
      editor.commands.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send')
    } finally {
      setBusy(false)
    }
  }
  sendRef.current = () => void send()

  return (
    <Form onSubmit={() => void send()}>
      <Stack gap={1}>
        <EditorSurface editor={editor} size="line" />
        <Row justify="between" align="center">
          <EditorToolbar editor={editor} />
          <Button type="submit" disabled={!canSend}>
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </Row>
        {error && <Text variant="secondary">{error}</Text>}
      </Stack>
    </Form>
  )
}
