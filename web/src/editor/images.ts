import type { Editor } from '@tiptap/core'
import { uploadImage } from '../api'

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/**
 * Upload a file and insert it at the cursor as our image node. Throws on a
 * refused upload. The alt text starts empty; the chip on the image in the
 * editor (EditorImage) is where it gets written.
 */
export async function insertImage(editor: Editor, file: File): Promise<void> {
  const img = await uploadImage(file)
  const alt = ''
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'image',
      attrs: { src: img.url, alt, 'data-image-id': img.id, width: img.width, height: img.height },
    })
    .run()
}

/** The image files in a paste or drop, if any. */
export function imageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return []
  return Array.from(dt.files).filter((f) => f.type.startsWith('image/'))
}
