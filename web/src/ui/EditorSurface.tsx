import { EditorContent, type Editor } from '@tiptap/react'
import styles from './EditorSurface.module.css'

interface EditorSurfaceProps {
  editor: Editor | null
}

/** The TipTap editing surface. Owns the editor's CSS so composites need none. */
export function EditorSurface({ editor }: EditorSurfaceProps) {
  return <EditorContent editor={editor} className={styles.surface} />
}
