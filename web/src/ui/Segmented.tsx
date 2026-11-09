import { buttonClass } from './Button'
import { Icon, type IconName } from './Icon'
import { Dotted } from './Dotted'

interface Segment<K extends string> {
  key: K
  icon: IconName
  label: string
  /** Whether this view has unread content. Shows a dot and adds "unread" to the accessible name. */
  dot?: boolean
  /** Names this element for the welcome tour, which points at it (src/tour/steps.ts). */
  tour?: string
}

interface SegmentedProps<K extends string> {
  /** The group's accessible name, for example "View". */
  label: string
  segments: Segment<K>[]
  value: K
  /** Icons only, for the phone bar. The label becomes the accessible name and is not shown. */
  compact?: boolean
  onChange: (key: K) => void
}

/** A choice between views of one thing, such as Posts and Chat, rendered as a row of toggle buttons. */
export function Segmented<K extends string>({ label, segments, value, compact = false, onChange }: SegmentedProps<K>) {
  return (
    <div role="group" aria-label={label} className="flex flex-none gap-1">
      {segments.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-pressed={s.key === value}
          data-tour={s.tour}
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
