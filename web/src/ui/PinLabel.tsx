import { Icon } from './Icon'

/** The same quiet pin label inside a post and beside its room name. */
export function PinLabel({ label = 'Pinned' }: { label?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm leading-5 text-mute">
      <Icon name="pin" size={14} />
      {label}
    </span>
  )
}
