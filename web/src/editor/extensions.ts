import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extensions'
import type { Extensions } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { EditorImage } from '../ui'

// The drop indicator line shown between blocks while dragging an image card.
const dropcursor = { color: '#ed5e5e', width: 2 }

const link = Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' })

/**
 * An uploaded image. Only our own /img/<id> urls survive the server's
 * sanitiser. The width and height attributes (TipTap's own) let the page
 * reserve space before the bytes arrive, and data-image-id identifies the
 * upload. In the editor the node is rendered by EditorImage, a card with the
 * alt text field. getHTML() still serialises a plain <img>, so stored HTML is
 * unchanged.
 */
export const SweetImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-image-id': { default: null },
    }
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
 * Paragraph, h2/h3, bold, italic, strike, link, bullet/ordered lists,
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
  placeholder,
  SweetImage,
]

/**
 * The chat schema. A strict subset of the post schema, with paragraph, bold,
 * italic, strike, link and hard break. The server policy is the same, and
 * the editor is smaller. There is no image node. Chat images are attached
 * above the text (BodyEditor `images="attached"`) and sent as a block of
 * <img> elements before it.
 */
export const chatExtensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
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
  }),
  link,
  placeholder,
]

/** The comment schema. The chat schema plus blockquote, which is used for a quote-reply. */
export const commentExtensions = [
  StarterKit.configure({
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
  }),
  link,
  placeholder,
  SweetImage,
]
