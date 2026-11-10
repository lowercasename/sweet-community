import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import type { Extensions } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin } from '@tiptap/pm/state'
import { EditorImage } from '../ui'
import { Embed, SweetLink } from './embed'
import { newImageStorage, releaseImages, restoreUploads, retryUpload, type ImageStorage } from './images'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sweetImage: {
      /** Uploads again the image whose upload failed, by the key on its node. */
      retryUpload: (key: string) => ReturnType
    }
  }
  interface Storage {
    image: ImageStorage
  }
}

// The drop indicator line shown between blocks while dragging an image card.
const dropcursor = { color: '#ed5e5e', width: 2 }

const link = SweetLink

/**
 * An uploaded image. Only our own /img/<id> urls survive the server's
 * sanitiser. The width and height attributes (TipTap's own) let the page
 * reserve space before the bytes arrive, and data-image-id identifies the
 * upload. In the editor the node is rendered by EditorImage, a card with the
 * alt text field. getHTML() still serialises a plain <img>, so stored HTML is
 * unchanged. An image just added shows at once from a local copy while it
 * uploads. `upload` is its key. `progress` is the fraction sent. `failed` is
 * the reason its upload failed, or '' when there is none to give. These three
 * attributes exist only in the editor and are never saved.
 */
export const SweetImage = Image.extend({
  // Only Sweet's own images are read from HTML. Pictures in HTML pasted from another site are left out, because the
  // server would remove them, and a copied card of an image still uploading has no upload to finish.
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (el) => (el.getAttribute('src')?.startsWith('/img/') ? null : false) }]
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-image-id': { default: null },
      upload: { default: null, rendered: false },
      progress: { default: null, rendered: false },
      failed: { default: null, rendered: false },
    }
  },
  addCommands() {
    return {
      ...this.parent?.(),
      retryUpload:
        (key: string) =>
        ({ editor, tr, dispatch }) => {
          if (!dispatch) return true
          return retryUpload(editor, tr, key)
        },
    }
  },
  addStorage() {
    return newImageStorage()
  },
  onDestroy() {
    releaseImages(this.storage)
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? restoreUploads(editor, state) : null),
      }),
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditorImage)
  },
}).configure({ inline: false, allowBase64: false })

/** The placeholder of an editor that is not given one. */
export const DEFAULT_PLACEHOLDER = 'What would you like to say?'

const placeholder = Placeholder.configure({ placeholder: DEFAULT_PLACEHOLDER })

/**
 * The same extensions with a different placeholder. A reply box names the user it replies to. A function is called
 * each time the placeholder is drawn, so the text can change after the editor is created.
 */
export function withPlaceholder(extensions: Extensions, text: string | (() => string)): Extensions {
  return [
    ...extensions.filter((e) => e.name !== 'placeholder'),
    Placeholder.configure({ placeholder: typeof text === 'string' ? text : () => text() }),
  ]
}

/**
 * The post schema, used by BodyEditor for posts and by the round-trip test.
 * Paragraph, h2/h3, bold, italic, strike, link, link preview card, bullet/ordered lists,
 * blockquote, hard break, undo/redo. Nothing else.
 */
export const postExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    // StarterKit v3 bundles its own Link extension. It is disabled so the explicitly configured one below is used.
    link: false,
    // Not in the PoC schema.
    underline: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    // The trailing node extension would append an empty <p></p> after a trailing
    // list or blockquote, which getHTML() would then send to the server as part of
    // the post body.
    trailingNode: false,
    dropcursor,
  }),
  link,
  Embed,
  placeholder,
  SweetImage,
]

/** The StarterKit options of the short editors: chat, comments, bios and community texts. */
const shortKit = {
  heading: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  link: false,
  underline: false,
  code: false,
  codeBlock: false,
  horizontalRule: false,
  trailingNode: false,
  dropcursor,
} as const

/**
 * The chat schema. A strict subset of the post schema, with paragraph, bold,
 * italic, strike, link, link preview card and hard break. The server policy is the same, and
 * the editor is smaller. There is no image node. Chat images are attached
 * above the text (BodyEditor `images="attached"`) and sent as a block of
 * <img> elements before it.
 */
export const chatExtensions = [StarterKit.configure({ ...shortKit, blockquote: false }), link, Embed, placeholder]

const commentKit = StarterKit.configure(shortKit)

/** The comment schema. The chat schema plus blockquote, which is used for a quote-reply. */
export const commentExtensions = [commentKit, link, Embed, placeholder, SweetImage]

/**
 * The schema of a bio, the rules and the welcome message. It is the comment schema without images and preview cards,
 * so a link on its own line stays a link. The server's policy for these texts is the same.
 */
export const textExtensions = [commentKit, link, placeholder]
