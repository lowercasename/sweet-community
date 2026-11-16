import { Icon } from './Icon'
import { useTooltip } from './Tooltip'

interface PrivateMarkProps {
  /** A mark inside a button uses that button's accessible description. */
  focusable?: boolean
}

/** The same privacy indicator beside every private room name. */
export function PrivateMark({ focusable = true }: PrivateMarkProps) {
  const tip = useTooltip('Private room', true)
  return (
    <>
      <span
        ref={tip.ref}
        role="img"
        aria-label="Private room"
        tabIndex={focusable ? 0 : undefined}
        className="inline-flex shrink-0 items-center rounded-[2px] align-middle text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink"
        {...tip.props()}
      >
        <Icon name="lock" size={14} />
      </span>
      {tip.tooltip}
    </>
  )
}
