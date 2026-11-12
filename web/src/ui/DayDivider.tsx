import { dayLabel, useNow } from './Time'

/** A quiet date label separating calendar days in a chat. */
export function DayDivider({ at }: { at: number }) {
  const label = dayLabel(at, useNow())
  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 py-1 text-xs text-mute">
      <span aria-hidden="true" className="min-w-0 flex-1 border-t border-line" />
      <span className="shrink-0">{label}</span>
      <span aria-hidden="true" className="min-w-0 flex-1 border-t border-line" />
    </div>
  )
}
