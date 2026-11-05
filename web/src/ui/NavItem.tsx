import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { useTooltip } from './Tooltip'

interface NavItemProps {
  /** A feature's icon. */
  icon?: IconName
  /** A place's or person's mark (a Tile, an Avatar), drawn where the icon would be. */
  mark?: ReactNode
  label: string
  /** Whether the bar is expanded; collapsed hides the label and says it in a tooltip. */
  expanded: boolean
  /** The item for the page being viewed. */
  current?: boolean
  /** `sm` inside a section: shorter and quieter, so the items read as a stack under their title. */
  size?: 'md' | 'sm'
  onClick?: () => void
}

/** One entry in the NavBar: an icon or a mark, plus its label when expanded. */
export function NavItem({ icon, mark, label, expanded, current, size = 'md', onClick }: NavItemProps) {
  const tip = useTooltip(label, !expanded, 'right')
  return (
    <>
      <button
        ref={tip.ref}
        type="button"
        aria-current={current ? 'page' : undefined}
        aria-label={expanded ? undefined : label}
        className={`flex cursor-pointer items-center gap-3 rounded-[4px] text-mute transition-colors hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink aria-[current=page]:bg-blush aria-[current=page]:text-sweet ${size === 'sm' ? 'h-8 text-sm' : 'h-10'} ${expanded ? 'px-3' : 'justify-center'}`}
        {...tip.props({ onClick })}
      >
        {mark ?? (icon && <Icon name={icon} size={20} />)}
        {expanded && <span className="truncate font-medium">{label}</span>}
      </button>
      {tip.tooltip}
    </>
  )
}
