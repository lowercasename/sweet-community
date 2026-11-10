import { Node, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import Link from '@tiptap/extension-link'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { EmbedView } from '../components/EmbedView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      /** Turns the card at pos back into a plain link, marked so that it is not made a card again. */
      unembed: (pos: number) => ReturnType
    }
  }
}

/** The attributes TipTap gives every link. A card's link has the same, so the stored HTML has one form. */
const LINK_ATTRS = { target: '_blank', rel: 'noopener noreferrer nofollow' }
const URL_RE = /^https?:\/\/\S+$/i

/**
 * A link. `plain` marks a link that its author turned back from a card, as data-plain-link="", so that it is not made
 * a card again when the post is saved.
 */
export const SweetLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      plain: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-plain-link'),
        renderHTML: (attrs: { plain?: boolean }) => (attrs.plain ? { 'data-plain-link': '' } : {}),
      },
    }
  },
}).configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' })

/**
 * The address in a top-level paragraph that holds nothing but one link, or null. A link kept plain does not count,
 * and neither does a line with anything else in it, such as a mention or a line break.
 */
export function linkOnly(node: PMNode): string | null {
  if (node.type.name !== 'paragraph') return null
  const text = node.textContent.trim()
  if (!URL_RE.test(text)) return null
  let href: string | null = null
  let excluded = false
  node.forEach((child) => {
    if (!child.isText) {
      excluded = true
      return
    }
    const link = child.marks.find((m) => m.type.name === 'link')
    if (link?.attrs.plain) excluded = true
    if (link) href = link.attrs.href as string
  })
  return excluded ? null : (href ?? text)
}

/**
 * A link preview card: a paragraph that holds one link, stored as <p data-embed=""><a href="...">...</a></p>. The
 * card's title, description and picture are the server's, fetched by address. In the editor the card is drawn by
 * EmbedView. Enter at the end of a line that is only a link turns the line into a card.
 */
export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { url: { default: null } }
  },

  parseHTML() {
    return [
      {
        tag: 'p[data-embed]',
        // Ahead of the paragraph rule, which matches every <p>.
        priority: 100,
        getAttrs: (el: HTMLElement) => {
          const url = el.querySelector('a')?.getAttribute('href')
          return url ? { url } : false
        },
      },
    ]
  },

  renderHTML({ node }) {
    const url = node.attrs.url as string
    return ['p', { 'data-embed': '' }, ['a', { ...LINK_ATTRS, href: url }, url]]
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView)
  },

  addCommands() {
    return {
      unembed:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const node = state.doc.nodeAt(pos)
          if (!node || node.type.name !== 'embed') return false
          const url = node.attrs.url as string
          const mark = state.schema.marks.link.create({ ...LINK_ATTRS, href: url, plain: true })
          const line = state.schema.nodes.paragraph.create(null, state.schema.text(url, [mark]))
          if (dispatch) tr.replaceWith(pos, pos + node.nodeSize, line)
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => embedOnEnter(editor),
    }
  },
})

/** Enter at the end of a top-level line that is only a link: the line becomes a card, and the cursor a new line. */
function embedOnEnter(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  if (!empty || $from.depth !== 1 || $from.parentOffset !== $from.parent.content.size) return false
  const url = linkOnly($from.parent)
  if (!url) return false
  const pos = $from.before()
  const { embed, paragraph } = state.schema.nodes
  const tr = state.tr.replaceWith(pos, pos + $from.parent.nodeSize, [embed.create({ url }), paragraph.create()])
  // The embed is one position wide, and the new line's text starts one position inside it.
  tr.setSelection(TextSelection.create(tr.doc, pos + 2))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Turns lines that are only a link into cards before a body is saved. `last` converts the last line that has
 * anything in it, for a post or a comment saved without pressing Enter after its link. `all` converts every such
 * line, for a chat message, where a line ends with a line break (Shift+Enter): the lines around a link stay text.
 * Returns whether anything changed.
 */
export function embedLinks(editor: Editor, which: 'last' | 'all'): boolean {
  const { state } = editor
  const { paragraph, embed, hardBreak } = state.schema.nodes
  let lastFilled = -1
  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph' || node.content.size > 0) lastFilled = offset
  })
  const changes: { pos: number; size: number; nodes: PMNode[] }[] = []
  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return
    if (which === 'last') {
      const url = offset === lastFilled ? linkOnly(node) : null
      if (url) changes.push({ pos: offset, size: node.nodeSize, nodes: [embed.create({ url })] })
      return
    }
    const lines: PMNode[][] = [[]]
    node.forEach((child) => {
      if (child.type === hardBreak) lines.push([])
      else lines[lines.length - 1].push(child)
    })
    const urls = lines.map((line) => linkOnly(paragraph.create(null, line)))
    if (!urls.some(Boolean)) return
    const nodes: PMNode[] = []
    let text: PMNode[] = []
    const flush = () => {
      if (text.length > 0) nodes.push(paragraph.create(null, text))
      text = []
    }
    lines.forEach((line, i) => {
      const url = urls[i]
      if (url) {
        flush()
        nodes.push(embed.create({ url }))
        return
      }
      if (text.length > 0) text.push(hardBreak.create())
      text.push(...line)
    })
    flush()
    changes.push({ pos: offset, size: node.nodeSize, nodes })
  })
  if (changes.length === 0) return false
  const tr = state.tr
  // From the end, so earlier positions stay valid.
  for (const c of [...changes].reverse()) tr.replaceWith(c.pos, c.pos + c.size, c.nodes)
  editor.view.dispatch(tr)
  return true
}
