import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import type { User } from '../api'
import { Avatar } from './Avatar'

export interface SuggestionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

/**
 * The list shown under an @ in an editor. It lists the users whose names
 * start with the typed text. The arrow keys move the selection, and Enter,
 * Tab or a click picks one. The editor's mention extension positions it.
 * This component is only the list itself.
 */
export const SuggestionList = forwardRef<SuggestionListHandle, SuggestionProps<User>>(function SuggestionList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0)
  useEffect(() => setSelected(0), [items])
  const pick = (i: number) => {
    const u = items[i]
    if (u) command({ id: u.id, label: u.username })
  }
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s + items.length - 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        pick(selected)
        return items.length > 0
      }
      return false
    },
  }))
  if (items.length === 0) return null
  return (
    <div
      role="listbox"
      aria-label="People"
      className="z-50 min-w-40 rounded-card border border-line bg-card p-1 shadow-sm"
    >
      {items.map((u, i) => (
        <button
          key={u.id}
          type="button"
          role="option"
          aria-selected={i === selected}
          className="flex w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1 text-left text-sm text-ink aria-selected:bg-blush aria-selected:text-sweet hover:bg-field"
          onMouseEnter={() => setSelected(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(i)}
        >
          <Avatar name={u.username} picture={u.picture} size="xs" decorative />
          {u.username}
        </button>
      ))}
    </div>
  )
})
