import { Dotted } from './Dotted'
import { Icon, type IconName } from './Icon'

interface RailProps {
  /** Which edge the rail sits on. */
  side: 'left' | 'right'
  icon: IconName
  label: string
  /** Something unread in the folded pane: a dot, and "unread" in its name. */
  dot?: boolean
  onOpen: () => void
}

/** A collapsed pane: a thin vertical strip with the pane's icon and name, one click to reopen. */
export function Rail({ side, icon, label, dot = false, onOpen }: RailProps) {
  const border = side === 'left' ? 'border-r' : 'border-l'
  return (
    <button
      type="button"
      className={`flex w-10 cursor-pointer flex-col items-center gap-3 ${border} border-line bg-card pt-4 text-mute transition-colors hover:bg-field hover:text-sweet focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink`}
      aria-label={`Show ${label.toLowerCase()}${dot ? ', unread' : ''}`}
      onClick={onOpen}
    >
      <Dotted shown={dot}>
        <Icon name={icon} size={20} />
      </Dotted>
      <span className="text-sm font-medium [writing-mode:vertical-rl]">{label}</span>
    </button>
  )
}
