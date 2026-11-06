import type { ReactNode } from 'react'
import { Count } from './Count'
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
  /** Something unread behind it: a dot on the icon, never a count, and "unread" in its name (the name is then the aria-label, in both states). */
  dot?: boolean
  /** Unread messages behind a place: the number in a pill when expanded, a dot when collapsed, and "N unread" in its name. */
  count?: number
  onClick?: () => void
}

/** The dot on an icon's corner; the icon's wrapper is relative. Shared with the phone's tab bar. */
export function UnreadDot() {
  return (
    <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-sweet ring-2 ring-card" />
  )
}

/** One entry in the NavBar: an icon or a mark, plus its label when expanded. */
export function NavItem({
  icon,
  mark,
  label,
  expanded,
  current,
  size = 'md',
  dot = false,
  count = 0,
  onClick,
}: NavItemProps) {
  const tip = useTooltip(label, !expanded, 'right')
  const name = count > 0 ? `${label}, ${count} unread` : dot ? `${label}, unread` : label
  const marked = dot || (count > 0 && !expanded)
  const glyph = mark ?? (icon && <Icon name={icon} size={20} />)
  return (
    <>
      <button
        ref={tip.ref}
        type="button"
        aria-current={current ? 'page' : undefined}
        aria-label={name === label && expanded ? undefined : name}
        className={`flex cursor-pointer items-center gap-3 rounded-[4px] text-mute transition-colors hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink aria-[current=page]:bg-blush aria-[current=page]:text-sweet ${size === 'sm' ? 'h-8 text-sm' : 'h-10'} ${expanded ? 'px-3' : 'justify-center'}`}
        {...tip.props({ onClick })}
      >
        {marked ? (
          <span className="relative flex flex-none">
            {glyph}
            <UnreadDot />
          </span>
        ) : (
          glyph
        )}
        {expanded && <span className="truncate font-medium">{label}</span>}
        {expanded && <Count n={count} />}
      </button>
      {tip.tooltip}
    </>
  )
}
