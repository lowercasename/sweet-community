import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface NavItemProps {
  /** A feature's icon. */
  icon?: IconName
  /** A place's or person's mark (a Tile, an Avatar), drawn where the icon would be. */
  mark?: ReactNode
  label: string
  /** Whether the bar is expanded; collapsed hides the label and shows it as a tooltip. */
  expanded: boolean
  /** The item for the page being viewed. */
  current?: boolean
  onClick?: () => void
}

/** One entry in the NavBar: an icon or a mark, plus its label when expanded. */
export function NavItem({ icon, mark, label, expanded, current, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      aria-label={expanded ? undefined : label}
      title={expanded ? undefined : label}
      className={`flex h-10 cursor-pointer items-center gap-3 rounded-[4px] text-mute transition-colors hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink aria-[current=page]:bg-blush aria-[current=page]:text-sweet ${expanded ? 'px-3' : 'justify-center'}`}
      onClick={onClick}
    >
      {mark ?? (icon && <Icon name={icon} size={20} />)}
      {expanded && <span className="truncate font-medium">{label}</span>}
    </button>
  )
}
