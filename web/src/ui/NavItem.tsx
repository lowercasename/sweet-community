import { Icon, type IconName } from './Icon'

interface NavItemProps {
  icon: IconName
  label: string
  /** Whether the bar is expanded; collapsed hides the label and shows it as a tooltip. */
  expanded: boolean
  /** The item for the page being viewed. */
  current?: boolean
  onClick?: () => void
}

/** One entry in the NavBar: an icon, plus its label when expanded. */
export function NavItem({ icon, label, expanded, current, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      aria-label={expanded ? undefined : label}
      title={expanded ? undefined : label}
      className={`flex h-10 cursor-pointer items-center gap-3 rounded-[4px] text-mute transition-colors hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink aria-[current=page]:bg-blush aria-[current=page]:text-sweet ${expanded ? 'px-3' : 'justify-center'}`}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
      {expanded && <span className="truncate font-medium">{label}</span>}
    </button>
  )
}
