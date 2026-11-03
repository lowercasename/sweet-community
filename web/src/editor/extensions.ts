import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

/**
 * The editor schema, shared by the Composer and the round-trip test.
 * Paragraph, h2/h3, bold, italic, strike, link, bullet/ordered lists,
 * blockquote, hard break, undo/redo. Nothing else.
 */
export const extensions = [
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
  Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
]
