import type { Editor } from '@tiptap/core'
import { uploadImage, type UploadedImage } from '../api'

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/** An uploaded image with the alt text entered so far. */
export interface AttachedImage extends UploadedImage {
  alt: string
}

/**
 * Uploads files in parallel, keeping the order they were chosen in. Returns
 * the images that uploaded successfully. `error` describes the failures, if
 * there were any.
 */
export async function uploadImages(files: File[]): Promise<{ images: AttachedImage[]; error?: string }> {
  const results = await Promise.allSettled(files.map((f) => uploadImage(f)))
  const images = results
    .filter((r): r is PromiseFulfilledResult<UploadedImage> => r.status === 'fulfilled')
    .map((r) => ({ ...r.value, alt: '' }))
  const failed = files.length - images.length
  if (failed === 0) return { images }
  const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
  const why = first.reason instanceof Error ? first.reason.message : 'upload refused'
  return { images, error: files.length === 1 ? why : `${failed} of ${files.length} images not added: ${why}` }
}

/** Uploads files and inserts them at the cursor as image nodes. Throws after inserting if any upload failed. */
export async function insertImages(editor: Editor, files: File[]): Promise<void> {
  const { images, error } = await uploadImages(files)
  if (images.length > 0) {
    editor
      .chain()
      .focus()
      .insertContent(images.map((img) => ({ type: 'image', attrs: imageAttrs(img) })))
      .run()
  }
  if (error) throw new Error(error)
}

/** The <img> elements for the images attached above a message, serialised as the editor would serialise them. */
export function imagesHtml(images: AttachedImage[]): string {
  return images
    .map((img) => {
      const el = document.createElement('img')
      for (const [k, v] of Object.entries(imageAttrs(img))) el.setAttribute(k, String(v))
      return el.outerHTML
    })
    .join('')
}

/** The attribute order matches TipTap's serialisation and the server's fixtures. */
function imageAttrs(img: AttachedImage) {
  return { src: img.url, alt: img.alt, width: img.width, height: img.height, 'data-image-id': img.id }
}

/** The image files in a paste or drop, if there are any. */
export function imageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return []
  return Array.from(dt.files).filter((f) => f.type.startsWith('image/'))
}
