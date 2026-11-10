import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { ApiError, uploadImage, type UploadedImage } from '../api'

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/** The longer side the server keeps (MaxSide in package images). The browser draws a larger image at this size. */
const MAX_SIDE = 2000

/** An uploaded image with the alt text entered so far. */
export interface AttachedImage extends UploadedImage {
  alt: string
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

/** Formats that hold photos, which become JPEG. Every other image becomes PNG, which keeps transparency. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/heic', 'image/heif'])

/**
 * Converts an image for upload. The browser decodes it, turns a phone photo upright and converts its colours to sRGB.
 * It is drawn at no more than MAX_SIDE on its longer side, with the browser's high-quality smoothing. A photo becomes
 * a JPEG. Any other image becomes a PNG, which keeps transparency, and the server keeps whichever of PNG and JPEG is
 * smaller. A GIF is sent as it is, because it may be animated. An image the browser cannot read is sent as it is,
 * and the server decides.
 */
export async function convert(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const encode = (type: string) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.92))
  let blob: Blob | null
  if (PHOTO_TYPES.has(file.type)) {
    blob = await encode('image/jpeg')
  } else {
    // A PNG keeps transparency. An opaque image whose JPEG is under a third of its PNG's size is a photo, such as
    // one pasted from the clipboard, and is sent as the JPEG. Anything else, such as a screenshot of text, is sent as
    // the PNG, which keeps it sharp, and the server keeps whichever of PNG and JPEG is smaller. The browser's PNG
    // encoder compresses less than the server's, so the browser does not choose by size alone.
    blob = await encode('image/png')
    if (blob && opaque(context, canvas.width, canvas.height)) {
      const jpeg = await encode('image/jpeg')
      if (jpeg && jpeg.size * 3 < blob.size) blob = jpeg
    }
  }
  // Releases the canvas's memory at once. Safari on iOS keeps it until the page is closed otherwise.
  canvas.width = 0
  canvas.height = 0
  return blob ?? file
}

/** Reports whether every pixel drawn on a canvas is opaque. */
function opaque(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = context.getImageData(0, 0, width, height)
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false
  return true
}

/**
 * Returns a function that runs tasks one at a time, in the order they are given. Converting decodes a whole photo,
 * so photos are converted one at a time to keep a phone's memory free.
 */
export function oneAtATime(): <T>(task: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve()
  return <T>(task: () => Promise<T>) => {
    const run = last.then(task)
    last = run.catch(() => undefined)
    return run
  }
}

/** Converts an image and uploads it. Used for profile and room pictures, which show no upload progress. */
export async function uploadPicture(file: File): Promise<UploadedImage> {
  return uploadImage(await convert(file))
}

/**
 * An image added to a post or comment, kept by its node's upload key. `file` is the chosen file, until it is
 * converted, and `preview` the address of its local copy. `converted` is the file to send, kept for Try again.
 * `done` holds the node's attributes once the upload has finished, and `failed` the reason it failed, so a node that
 * comes back through undo or redo shows the same.
 */
interface Upload {
  file?: File
  preview: string
  converted?: Blob
  done?: Record<string, unknown>
  failed?: string
}

/**
 * The uploads of one editor. SweetImage keeps it as the editor's storage, so it ends with the editor. `stop` cancels
 * the editor's conversions and uploads when it is destroyed.
 */
export interface ImageStorage {
  uploads: Map<string, Upload>
  queue: ReturnType<typeof oneAtATime>
  stop: AbortController
}

export const newImageStorage = (): ImageStorage => ({
  uploads: new Map(),
  queue: oneAtATime(),
  stop: new AbortController(),
})

/** Stops an editor's uploads and frees the local copies of its images, when the editor is destroyed. */
export function releaseImages(storage: ImageStorage) {
  storage.stop.abort()
  for (const u of storage.uploads.values()) URL.revokeObjectURL(u.preview)
  storage.uploads.clear()
}

const storageOf = (editor: Editor): ImageStorage => editor.storage.image

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
 * Converts and uploads the image with this key. Its node must already show the upload. Conversions wait for each
 * other, and uploads start as soon as their image is converted. The node's card shows the progress. On success the
 * node points at the stored image. On failure its card shows the error. The callbacks run after the caller returns,
 * so each dispatches a transaction of its own.
 */
function upload(editor: Editor, key: string) {
  const { uploads, queue, stop } = storageOf(editor)
  const u = uploads.get(key)
  if (!u) return
  const { signal } = stop
  const file = u.file
  const converted = u.converted
    ? Promise.resolve(u.converted)
    : queue(() => (signal.aborted || !file ? Promise.reject(signal.reason) : convert(file)))
  converted
    .then((blob) => {
      u.converted = blob
      u.file = undefined
      return uploadImage(blob, (fraction) => setImage(editor, key, { progress: fraction }), signal)
    })
    .then((img) => {
      u.done = {
        src: img.url,
        width: img.width,
        height: img.height,
        'data-image-id': img.id,
        upload: null,
        progress: null,
        failed: null,
      }
      u.converted = undefined
      URL.revokeObjectURL(u.preview)
      setImage(editor, key, u.done)
    })
    .catch((e: unknown) => {
      if (signal.aborted) return
      u.failed = failureReason(e)
      setImage(editor, key, { progress: null, failed: u.failed })
    })
}

/**
 * Uploads again the image with this key after its upload failed. It marks the node as uploading in `tr`, the
 * transaction of the command that calls it, and starts the upload.
 */
export function retryUpload(editor: Editor, tr: Transaction, key: string): boolean {
  const u = storageOf(editor).uploads.get(key)
  if (!u || u.done || !setImageIn(tr, key, { progress: 0, failed: null })) return false
  u.failed = undefined
  upload(editor, key)
  return true
}

/**
 * Gives an upload's outcome to an image node that came back without it. A node removed while it uploaded, then
 * restored by undo or redo, has its old attributes: it gets the finished upload's attributes, or the failure. A node
 * that already shows the outcome is left alone. Returns null when no node needs it.
 */
export function restoreUploads(editor: Editor, state: EditorState): Transaction | null {
  const { uploads } = storageOf(editor)
  let tr: Transaction | null = null
  state.doc.descendants((node, pos) => {
    const u = node.type.name === 'image' && node.attrs.upload ? uploads.get(node.attrs.upload) : undefined
    const outcome =
      u?.done ??
      (u?.failed !== undefined && node.attrs.failed !== u.failed ? { progress: null, failed: u.failed } : null)
    if (outcome) {
      tr ??= state.tr.setMeta('addToHistory', false)
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...outcome })
    }
  })
  return tr
}

/**
 * Inserts images at the cursor at once, each showing the chosen file, and converts and uploads them. Each card shows
 * its upload, and its error if the upload fails.
 */
export function insertImages(editor: Editor, files: File[]) {
  const { uploads } = storageOf(editor)
  const added = files.map((file) => {
    const key = crypto.randomUUID()
    const preview = URL.createObjectURL(file)
    uploads.set(key, { file, preview })
    return { key, preview }
  })
  editor
    .chain()
    .focus()
    .insertContent(
      added.map((a) => ({ type: 'image', attrs: { src: a.preview, alt: '', upload: a.key, progress: 0 } })),
    )
    .run()
  for (const a of added) upload(editor, a.key)
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
