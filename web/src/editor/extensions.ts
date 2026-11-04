import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extensions'

const link = Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' })

// Old Sweet's one placeholder, for posts and comments alike.
const placeholder = Placeholder.configure({ placeholder: 'What would you like to say?' })

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
  }),
  link,
  placeholder,
]

/**
 * The chat schema: a strict subset of the post schema (paragraph, bold,
 * italic, strike, link, hard break). Same server policy, smaller editor.
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
  }),
  link,
  placeholder,
]
