import type { Topic } from '../api'
import { Menu, type MenuItem } from '../ui'

interface TopicMenuProps {
  topics: Topic[]
  /** The topic chosen, or null for none. */
  value: string | null
  onChange: (topicId: string | null) => void
  /** What none is called: "No topic" on a post, "Everything" in the bar. */
  noneLabel: string
  /** Accessible name of the trigger. */
  label: string
  /** Actions before the choice: "Show Practice" on a post's pill. */
  leading?: MenuItem[]
  trigger: 'pill' | 'graft' | 'text'
  disabled?: boolean
  /** Grafted beside a Post that cannot be pressed yet: take its grey. */
  quiet?: boolean
}

/**
 * The one menu of topics (architecture.md, Topics), wherever a topic is
 * chosen: on a post's pill, in the bar, grafted onto Post. The trigger
 * reads the chosen topic's name, or what none is called.
 */
export function TopicMenu({
  topics,
  value,
  onChange,
  noneLabel,
  label,
  leading = [],
  trigger,
  disabled,
  quiet,
}: TopicMenuProps) {
  const chosen = topics.find((t) => t.id === value)
  const items: MenuItem[] = [
    ...leading,
    { label: noneLabel, checked: value === null, onSelect: () => onChange(null) },
    ...topics.map((t) => ({
      label: t.name,
      detail: t.description || undefined,
      checked: t.id === value,
      onSelect: () => onChange(t.id),
    })),
  ]
  return (
    <Menu label={label} items={items} trigger={trigger} quiet={quiet ?? !chosen} disabled={disabled}>
      {chosen ? chosen.name : trigger === 'graft' ? undefined : noneLabel}
    </Menu>
  )
}
