import { EditorContent, type Editor } from '@tiptap/react'

interface EditorSurfaceProps {
  editor: Editor | null
  /** `post` is a tall box; `line` starts one line high and grows. */
  size?: 'post' | 'line'
}

/** The TipTap editing surface. Its CSS is the .editor rules in global.css. */
export function EditorSurface({ editor, size = 'post' }: EditorSurfaceProps) {
  return <EditorContent editor={editor} className={`editor editor-${size}`} />
}
