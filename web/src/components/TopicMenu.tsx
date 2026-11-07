import type { Topic } from '../api'
import { Menu, type MenuItem, type PillSize } from '../ui'

interface TopicMenuProps {
  topics: Topic[]
  /** The topic chosen, or null for none. */
  value: string | null
  onChange: (topicId: string | null) => void
  /** What none is called in the list: "No topic" on a post, "Everything" in the bar. */
  noneLabel: string
  /** What the trigger says while none is chosen, when that differs ("Set topic" beside Post). */
  emptyLabel?: string
  /** Accessible name of the trigger. */
  label: string
  /** A control among controls (md, the default) or a label among content (sm). */
  size?: PillSize
  disabled?: boolean
}

/**
 * The one menu of topics (architecture.md, Topics), wherever a topic is
 * chosen: at the head of the feed, beside Post, in the editor. Its trigger
 * is a pill reading the chosen topic's name, or what none is called.
 */
export function TopicMenu({
  topics,
  value,
  onChange,
  noneLabel,
  emptyLabel,
  label,
  size = 'md',
  disabled,
}: TopicMenuProps) {
  const chosen = topics.find((t) => t.id === value)
  const items: MenuItem[] = [
    { label: noneLabel, checked: value === null, onSelect: () => onChange(null) },
    ...topics.map((t) => ({
      label: t.name,
      detail: t.description || undefined,
      checked: t.id === value,
      onSelect: () => onChange(t.id),
    })),
  ]
  return (
    <Menu label={label} items={items} trigger="pill" quiet={!chosen} size={size} disabled={disabled}>
      {chosen ? chosen.name : (emptyLabel ?? noneLabel)}
    </Menu>
  )
}
