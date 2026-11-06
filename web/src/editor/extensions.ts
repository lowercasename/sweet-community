import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extensions'
import type { Extensions } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { EditorImage } from '../ui'

// The drop line between blocks while dragging an image card.
const dropcursor = { color: '#ed5e5e', width: 2 }

const link = Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' })

/**
 * An uploaded image. Only our own /img/<id> urls survive the server's
 * sanitiser; width and height (TipTap's own) let the page reserve space
 * before the bytes arrive, and data-image-id names the upload. In the editor
 * the node is drawn by EditorImage, a card with the alt text field; getHTML()
 * still serialises the plain <img>, so stored HTML is unchanged.
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

const placeholder = Placeholder.configure({ placeholder: 'What would you like to say?' })

/** The same schema with another placeholder: a reply box says whom it answers. */
export function withPlaceholder(extensions: Extensions, text: string): Extensions {
  return [...extensions.filter((e) => e.name !== 'placeholder'), Placeholder.configure({ placeholder: text })]
}

/**
 * The post schema, used by BodyEditor for posts and by the round-trip test.
 * Paragraph, h2/h3, bold, italic, strike, link, bullet/ordered lists,
 * blockquote, hard break, undo/redo. Nothing else.
 */
export const postExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    // StarterKit v3 bundles its own Link; disabled so the explicit one below is used.
    link: false,
    // Not in the PoC schema.
    underline: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    // Would append an empty <p></p> after a trailing list/blockquote, which
    // getHTML() would then send to the server as part of the post body.
    trailingNode: false,
    dropcursor,
  }),
  link,
  placeholder,
  SweetImage,
]

/**
 * The chat schema: a strict subset of the post schema (paragraph, bold,
 * italic, strike, link, hard break). Same server policy, smaller editor.
 * No image node: chat images are attached above the text (BodyEditor
 * `images="attached"`) and sent as a block of <img> before it.
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

/** The comment schema: chat plus blockquote, which is what a quote-reply is. */
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
