interface RailProps {
  /** Which edge the rail sits on. */
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
      className={`flex w-10 cursor-pointer flex-col items-center ${border} border-line bg-card pt-4 text-mute transition-colors hover:bg-field hover:text-sweet focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink`}
      onClick={onOpen}
      title={`Show ${label.toLowerCase()}`}
    >
      <span className="text-sm font-medium [writing-mode:vertical-rl]">{label}</span>
    </button>
  )
}
