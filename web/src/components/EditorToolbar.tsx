import { useEditorState, type Editor } from '@tiptap/react'
import { Button, Row } from '../ui'

interface EditorToolbarProps {
  editor: Editor | null
}

/** Mod+K or the Link button: prompt for a URL and set/unset the link mark on the selection. */
export function promptLink(editor: Editor) {
  const previous = (editor.getAttributes('link').href as string | undefined) ?? ''
  const href = window.prompt('Link URL', previous)
  if (href === null) return
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href.trim() === '') chain.unsetLink().run()
  else chain.setLink({ href: href.trim() }).run()
}

/** Bold, italic, link. Phones have no ⌘ key, so these are not optional. */
export function EditorToolbar({ editor }: EditorToolbarProps) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      link: editor?.isActive('link') ?? false,
    }),
  })
  if (!editor) return null
  return (
    <Row gap={0} align="center">
      <Button
        variant="ghost"
        label="Bold"
        pressed={!!active?.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </Button>
      <Button
        variant="ghost"
        label="Italic"
        pressed={!!active?.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </Button>
      <Button variant="ghost" label="Link" pressed={!!active?.link} onClick={() => promptLink(editor)}>
        Link
      </Button>
    </Row>
  )
}
