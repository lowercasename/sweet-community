import type { Topic } from '../api'
import { Menu, type MenuItem, type PillSize } from '../ui'

interface TopicMenuProps {
  topics: Topic[]
  /** The chosen topic's id, or null for no topic. */
  value: string | null
  onChange: (topicId: string | null) => void
  /** The label of the no-topic item in the list. It is "No topic" on a post and "Everything" in the bar. */
  noneLabel: string
  /**
   * The trigger's text while no topic is chosen, when it differs from
   * noneLabel. For example "Set topic" beside Post.
   */
  emptyLabel?: string
  /** Accessible name of the trigger. */
  label: string
  /** The pill size. `md`, the default, is a control among controls. `sm` is a label among content. */
  size?: PillSize
  disabled?: boolean
}

/**
 * The single topic menu (architecture.md, Topics), used wherever a topic is
 * chosen. That is at the top of the feed, beside Post, and in the editor. Its
 * trigger is a pill showing the chosen topic's name, or the no-topic label.
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
