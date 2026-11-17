import { Icon } from './Icon'

/** The same quiet pin label inside a post and beside its room name. */
export function PinLabel({ label = 'Pinned' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 self-start align-middle text-sm text-mute">
      <Icon name="pin" size={14} />
      {label}
    </span>
  )
}
