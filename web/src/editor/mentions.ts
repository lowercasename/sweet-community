import Mention from '@tiptap/extension-mention'
import { ReactRenderer, type Extensions } from '@tiptap/react'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { computePosition, flip, offset, shift } from '@floating-ui/react'
import { PluginKey } from '@tiptap/pm/state'
import type { User } from '../api'
import { SuggestionList, type SuggestionListHandle } from '../ui'

/**
 * A mention in the editor. Typing @ offers the
 * users of the group, and picking one inserts a node that serialises to
 * <span data-type="mention" data-mention-id="<id>">@name</span>, which is the
 * only shape the server's sanitiser policy keeps. The name shown later is the
 * user's current name (content/decorate.ts), so the id is the important part.
 */
const SweetMention = Mention.extend({
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-mention-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-mention-id': attrs.id } : {}),
      },
      label: {
        default: null,
        parseHTML: (el) => el.textContent?.replace(/^@/, '') ?? null,
        renderHTML: () => ({}),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-mention-id]' }]
  },
})

/** The suggestion plugin's key. BodyEditor uses it to check whether a suggestion list is open before it treats Enter as send. */
export const mentionSuggestionKey = new PluginKey('sweetMention')

/** Adds the mention extension for these users to a set of editor extensions. */
export function withMentions(extensions: Extensions, people: () => User[]): Extensions {
  const mention = SweetMention.configure({
    HTMLAttributes: { 'data-type': 'mention' },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    renderHTML: ({ options, node }) => ['span', options.HTMLAttributes, `@${node.attrs.label ?? node.attrs.id}`],
    suggestion: {
      pluginKey: mentionSuggestionKey,
      char: '@',
      items: ({ query }) =>
        people()
          .filter((u) => u.username.toLowerCase().startsWith(query.toLowerCase()))
          .slice(0, 6),
      render: () => {
        let list: ReactRenderer<SuggestionListHandle, SuggestionProps<User>> | null = null
        // The suggestion plugin marks the @ with a decoration that the browser lays out
        // after this callback returns. Measure on the next animation frame. Measuring
        // immediately gave an empty rect for a lone @ and placed the list at x=0.
        const place = (props: SuggestionProps<User>) =>
          requestAnimationFrame(() => {
            const el = list?.element as HTMLElement | undefined
            const rect = props.clientRect?.()
            if (!el || !rect || (rect.width === 0 && rect.height === 0)) return
            void computePosition({ getBoundingClientRect: () => rect }, el, {
              placement: 'bottom-start',
              strategy: 'fixed',
              middleware: [offset(4), flip(), shift({ padding: 8 })],
            }).then(({ x, y }) => Object.assign(el.style, { position: 'fixed', left: `${x}px`, top: `${y}px` }))
          })
        return {
          onStart: (props) => {
            list = new ReactRenderer(SuggestionList, { props, editor: props.editor })
            // Keep the list off screen until it is positioned, so it does not flash at the bottom of the page.
            Object.assign(list.element.style, { position: 'fixed', left: '-9999px', top: '0' })
            document.body.appendChild(list.element)
            place(props)
          },
          onUpdate: (props) => {
            list?.updateProps(props)
            place(props)
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (props.event.key === 'Escape') {
              list?.destroy()
              list?.element.remove()
              list = null
              return true
            }
            return list?.ref?.onKeyDown(props) ?? false
          },
          onExit: () => {
            list?.destroy()
            list?.element.remove()
            list = null
          },
        }
      },
    },
  })
  return [...extensions.filter((e) => e.name !== 'mention'), mention]
}
