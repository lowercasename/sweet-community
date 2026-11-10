import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { ApiError, uploadImage, type UploadedImage } from '../api'

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/**
 * The longer side the server keeps (MaxSide in package images). The browser shrinks a larger image to it before
 * uploading, so a phone sends a much smaller file and the server rarely has to resize.
 */
const MAX_SIDE = 2000
/** An image within MAX_SIDE and below this size is uploaded as it is. */
const KEEP_BYTES = 2_000_000

/** An uploaded image with the alt text entered so far. */
export interface AttachedImage extends UploadedImage {
  alt: string
}

/** An image ready to upload: the file to send, an address for showing it at once, and its size in pixels. */
export interface Shrunk {
  file: Blob
  preview: string
  width: number
  height: number
}

/** The line under the editor when uploads fail. It gives no reason, because each image's card shows its own. */
export function failedUploads(failed: number, total: number): string {
  return total === 1 ? 'Failed to upload the image' : `Failed to upload ${failed} of ${total} images`
}

/**
 * The reason shown on a failed image's card, under "Failed to upload". Only the server's own refusals,
 * such as "That image is too large", are reasons. A failure the server did not describe has none.
 */
export function failureReason(e: unknown): string {
  return e instanceof ApiError && e.status >= 400 && e.status < 500 ? e.message : ''
}

/**
 * Shrinks an image to MAX_SIDE on its longer side and encodes it as JPEG, or as PNG when it was a PNG, which may be
 * transparent. The browser turns a phone photo upright when it reads it. A GIF is kept as it is, because it may be
 * animated. An image the browser cannot read is sent as it is, and the server decides.
 */
export async function shrink(file: File): Promise<Shrunk> {
  const original = (width = 0, height = 0): Shrunk => ({ file, preview: URL.createObjectURL(file), width, height })
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return original()
  }
  const { width, height } = bitmap
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  if (file.type === 'image/gif' || (scale === 1 && file.size <= KEEP_BYTES)) {
    bitmap.close()
    return original(width, height)
  }
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return original(width, height)
  }
  context.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.85))
  if (!blob) return original(width, height)
  const name = file.name.replace(/\.[^.]*$/, '') + (type === 'image/png' ? '.png' : '.jpg')
  const shrunk = new File([blob], name, { type })
  return { file: shrunk, preview: URL.createObjectURL(shrunk), width: w, height: h }
}

/**
 * The images being uploaded into a post or comment, by the key on their image node: the file, kept for Try again,
 * and the address of the local copy, which is freed when the upload succeeds.
 */
const pending = new Map<string, { file: Blob; preview: string }>()

/** The position of the image node with this upload key, or null if it has been removed. */
function imageAt(doc: PMNode, key: string): number | null {
  let at: number | null = null
  doc.descendants((node, pos) => {
    if (at === null && node.type.name === 'image' && node.attrs.upload === key) at = pos
    return at === null
  })
  return at
}

/** Sets attributes on the image node with this upload key in `tr`. Upload state is kept out of the undo history. */
function setImageIn(tr: Transaction, key: string, attrs: Record<string, unknown>): boolean {
  const at = imageAt(tr.doc, key)
  const node = at === null ? null : tr.doc.nodeAt(at)
  if (at === null || !node) return false
  tr.setNodeMarkup(at, undefined, { ...node.attrs, ...attrs }).setMeta('addToHistory', false)
  return true
}

/** Sets attributes on the image node with this upload key, in a transaction of its own. */
function setImage(editor: Editor, key: string, attrs: Record<string, unknown>) {
  if (editor.isDestroyed) return
  const { tr } = editor.state
  if (setImageIn(tr, key, attrs)) editor.view.dispatch(tr)
}

/**
 * Uploads the file kept for this key. Its node must already show the upload. The node's card shows the progress. On
 * success the node points at the stored image. On failure its card shows the error. The callbacks run after the
 * caller returns, so each dispatches a transaction of its own.
 */
function upload(editor: Editor, key: string) {
  const image = pending.get(key)
  if (!image) return
  uploadImage(image.file, (fraction) => setImage(editor, key, { progress: fraction }))
    .then((img) => {
      pending.delete(key)
      URL.revokeObjectURL(image.preview)
      setImage(editor, key, {
        src: img.url,
        width: img.width,
        height: img.height,
        'data-image-id': img.id,
        upload: null,
        progress: null,
        failed: null,
      })
    })
    .catch((e: unknown) => setImage(editor, key, { progress: null, failed: failureReason(e) }))
}

/**
 * Uploads again the image with this key after its upload failed. It marks the node as uploading in `tr`, the
 * transaction of the command that calls it, and starts the upload.
 */
export function retryUpload(editor: Editor, tr: Transaction, key: string): boolean {
  if (!pending.has(key) || !setImageIn(tr, key, { progress: 0, failed: null })) return false
  upload(editor, key)
  return true
}

/**
 * Inserts images at the cursor at once, each showing its own picture, and uploads them. Each card shows its upload,
 * and its error if the upload fails.
 */
export async function insertImages(editor: Editor, files: File[]): Promise<void> {
  const shrunk = await Promise.all(files.map(shrink))
  const keys = shrunk.map((s) => {
    const key = crypto.randomUUID()
    pending.set(key, { file: s.file, preview: s.preview })
    return key
  })
  editor
    .chain()
    .focus()
    .insertContent(
      shrunk.map((s, i) => ({
        type: 'image',
        attrs: { src: s.preview, alt: '', width: s.width, height: s.height, upload: keys[i], progress: 0 },
      })),
    )
    .run()
  for (const key of keys) upload(editor, key)
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
