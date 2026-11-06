import Mention from '@tiptap/extension-mention'
import { ReactRenderer, type Extensions } from '@tiptap/react'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { computePosition, flip, offset, shift } from '@floating-ui/react'
import { PluginKey } from '@tiptap/pm/state'
import type { User } from '../api'
import { SuggestionList, type SuggestionListHandle } from '../ui'

/**
 * A mention in the editor (architecture.md, Posts): typing @ offers the
 * people here, and picking one inserts a node that serialises to
 * <span data-type="mention" data-mention-id="<id>">@name</span>, the one
 * shape the server's policy keeps. The name shown later is the person's
 * current one (content/decorate.ts), so the id is what matters.
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

/** The suggestion plugin's key: BodyEditor asks it whether a list is open before it treats Enter as send. */
export const mentionSuggestionKey = new PluginKey('sweetMention')

/** The post, comment and chat schemas with @mentions of these people. */
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
        const place = async (props: SuggestionProps<User>) => {
          const el = list?.element as HTMLElement | undefined
          const rect = props.clientRect?.()
          if (!el || !rect) return
          const { x, y } = await computePosition({ getBoundingClientRect: () => rect }, el, {
            placement: 'bottom-start',
            strategy: 'fixed',
            middleware: [offset(4), flip(), shift({ padding: 8 })],
          })
          Object.assign(el.style, { position: 'fixed', left: `${x}px`, top: `${y}px` })
        }
        return {
          onStart: (props) => {
            list = new ReactRenderer(SuggestionList, { props, editor: props.editor })
            document.body.appendChild(list.element)
            void place(props)
          },
          onUpdate: (props) => {
            list?.updateProps(props)
            void place(props)
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
