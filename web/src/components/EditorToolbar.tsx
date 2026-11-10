import { useEditorState, type Editor } from '@tiptap/react'
import { Button, EmojiButton, FilePicker, LinkPopover, Row } from '../ui'
import { useMediaQuery } from '../hooks/useLayout'
import { IMAGE_ACCEPT } from '../editor/images'

interface EditorToolbarProps {
  editor: Editor | null
  /** When set, an image button is shown and passes the chosen files to this callback. */
  onImage?: (files: File[]) => void
  /** Whether the link panel is open. The editor opens it on Mod+K too. */
  linkOpen: boolean
  onLinkOpenChange: (open: boolean) => void
}

/**
 * Sets a link from the link panel. With text selected, or the cursor in a link, the link is set on it. Otherwise the
 * address is inserted as linked text, and typing after it is not part of the link. An address with no scheme, such
 * as example.com, gets https://.
 */
export function saveLink(editor: Editor, address: string) {
  const href = /^[a-z][a-z0-9+.-]*:/i.test(address) ? address : `https://${address}`
  if (editor.state.selection.empty && !editor.isActive('link')) {
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
      .unsetMark('link')
      .run()
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }
}

/**
 * The Bold, Italic and Link buttons, the image button when `onImage` is set, and the emoji button. Phones have no ⌘
 * key, so the formatting buttons are always shown. The emoji button is shown only on a device with a mouse or
 * trackpad, because a phone's keyboard has emoji (Raphael, 2026-11-10).
 */
export function EditorToolbar({ editor, onImage, linkOpen, onLinkOpenChange }: EditorToolbarProps) {
  const pointer = useMediaQuery('(pointer: fine)')
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      link: editor?.isActive('link') ?? false,
      href: (editor?.getAttributes('link').href as string | undefined) ?? '',
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
      <LinkPopover
        open={linkOpen}
        onOpenChange={(open) => {
          onLinkOpenChange(open)
          if (!open) editor.commands.focus()
        }}
        active={!!active?.link}
        url={active?.href ?? ''}
        onSave={(address) => {
          saveLink(editor, address)
          onLinkOpenChange(false)
        }}
        onRemove={() => {
          editor.chain().focus().extendMarkRange('link').unsetLink().run()
          onLinkOpenChange(false)
        }}
      />
      {onImage && <FilePicker accept={IMAGE_ACCEPT} icon="image" label="Add images" multiple onPick={onImage} />}
      {pointer && <EmojiButton onPick={(emoji) => editor.chain().focus().insertContent(emoji).run()} />}
    </Row>
  )
}
