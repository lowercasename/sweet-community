import { Icon } from './Icon'

/** The same privacy indicator beside every private room name. */
export function PrivateMark() {
  return (
    <span
      role="img"
      aria-label="Private room"
      title="Private room"
      className="inline-flex shrink-0 items-center align-middle text-mute"
    >
      <Icon name="lock" size={14} />
    </span>
  )
}
