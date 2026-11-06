import { buttonClass } from './Button'
import { Icon, type IconName } from './Icon'
import { Dotted } from './Dotted'

interface Segment<K extends string> {
  key: K
  icon: IconName
  label: string
  /** Something unread behind this view: a dot, and "unread" in its name. */
  dot?: boolean
}

interface SegmentedProps<K extends string> {
  /** What the choice is, for assistive tech ("View"). */
  label: string
  segments: Segment<K>[]
  value: K
  /** Icons only (a phone's bar): the label is the name, not shown. */
  compact?: boolean
  onChange: (key: K) => void
}

/** A choice between views of one thing (Posts, Chat), drawn as pressed buttons in a row. */
export function Segmented<K extends string>({ label, segments, value, compact = false, onChange }: SegmentedProps<K>) {
  return (
    <div role="group" aria-label={label} className="flex flex-none gap-1">
      {segments.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-pressed={s.key === value}
          aria-label={s.dot ? `${s.label}, unread` : compact ? s.label : undefined}
          className={buttonClass('ghost', compact)}
          onClick={() => onChange(s.key)}
        >
          <Dotted shown={s.dot === true}>
            <Icon name={s.icon} />
          </Dotted>
          {!compact && s.label}
        </button>
      ))}
    </div>
  )
}
