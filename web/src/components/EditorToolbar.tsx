import { useEditorState, type Editor } from '@tiptap/react'
import { Button, EmojiButton, FilePicker, Row } from '../ui'
import { useMediaQuery } from '../hooks/useLayout'
import { IMAGE_ACCEPT } from '../editor/images'

interface EditorToolbarProps {
  editor: Editor | null
  /** When set, an image button is shown and passes the chosen files to this callback. */
  onImage?: (files: File[]) => void
}

/** Called by Mod+K or the Link button. Prompts for a URL and sets or unsets the link mark on the selection. */
export function promptLink(editor: Editor) {
  const previous = (editor.getAttributes('link').href as string | undefined) ?? ''
  const href = window.prompt('Link URL', previous)
  if (href === null) return
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href.trim() === '') chain.unsetLink().run()
  else chain.setLink({ href: href.trim() }).run()
}

/**
 * The Bold, Italic and Link buttons, the image button when `onImage` is set, and the emoji button. Phones have no ⌘
 * key, so the formatting buttons are always shown. The emoji button is shown only on a device with a mouse or
 * trackpad, because a phone's keyboard has emoji (Raphael, 2026-11-10).
 */
export function EditorToolbar({ editor, onImage }: EditorToolbarProps) {
  const pointer = useMediaQuery('(pointer: fine)')
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
        icon="bold"
        label="Bold"
        pressed={!!active?.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Button
        variant="ghost"
        icon="italic"
        label="Italic"
        pressed={!!active?.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Button variant="ghost" icon="link" label="Link" pressed={!!active?.link} onClick={() => promptLink(editor)} />
      {onImage && <FilePicker accept={IMAGE_ACCEPT} icon="image" label="Add images" multiple onPick={onImage} />}
      {pointer && <EmojiButton onPick={(emoji) => editor.chain().focus().insertContent(emoji).run()} />}
    </Row>
  )
}
