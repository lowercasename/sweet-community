import type { Editor } from '@tiptap/core'
import { uploadImage } from '../api'

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/** Old Sweet's alt-text prompt, verbatim. Empty is allowed: not every picture needs words. */
const ALT_PROMPT = 'Describe this image for people using screen readers.'

/** Upload a file and insert it at the cursor as our image node. Throws on a refused upload. */
export async function insertImage(editor: Editor, file: File): Promise<void> {
  const img = await uploadImage(file)
  const alt = window.prompt(ALT_PROMPT, '') ?? ''
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
