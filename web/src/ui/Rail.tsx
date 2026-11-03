import { Icon } from './Icon'

interface RailProps {
  /** Which edge the rail sits on; decides the icon direction. */
  side: 'left' | 'right'
  label: string
  onOpen: () => void
}

/** A collapsed pane: a thin vertical strip with the pane's name, one click to reopen. */
export function Rail({ side, label, onOpen }: RailProps) {
  const border = side === 'left' ? 'border-r' : 'border-l'
  return (
    <button
      type="button"
      className={`flex w-11 cursor-pointer flex-col items-center gap-3 ${border} border-line bg-card pt-3 text-mute transition-colors hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink`}
      onClick={onOpen}
      title={`Show ${label.toLowerCase()}`}
    >
      <Icon name={side === 'left' ? 'panel-left-open' : 'panel-right-open'} />
      <span className="text-sm font-medium [writing-mode:vertical-rl]">{label}</span>
    </button>
  )
}
