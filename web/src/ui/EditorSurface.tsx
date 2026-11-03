import { EditorContent, type Editor } from '@tiptap/react'
import styles from './EditorSurface.module.css'

interface EditorSurfaceProps {
  editor: Editor | null
  /** `post` is a tall box; `line` starts one line high and grows. */
  size?: 'post' | 'line'
}

/** The TipTap editing surface. Owns the editor's CSS so composites need none. */
export function EditorSurface({ editor, size = 'post' }: EditorSurfaceProps) {
  return <EditorContent editor={editor} className={`${styles.surface} ${styles[size]}`} />
}
