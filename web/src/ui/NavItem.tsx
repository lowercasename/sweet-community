import type { ReactNode } from 'react'
import { GHOST_CURRENT, GHOST_HOVER } from './Button'
import { Dotted } from './Dotted'
import { Icon, type IconName } from './Icon'
import { ShieldMark } from './ShieldMark'
import { useTooltip } from './Tooltip'

interface NavItemProps {
  /** A feature's icon. */
  icon?: IconName
  /** A group's or user's image (a Tile or an Avatar), drawn in place of the icon. */
  mark?: ReactNode
  label: string
  /** Whether the nav bar is expanded. When it is collapsed, the label is hidden and shown in a tooltip instead. */
  expanded: boolean
  /** The item for the page being viewed. */
  current?: boolean
  /** `sm` is used inside a section. It is shorter and has smaller text, so the items read as a list under the title. */
  size?: 'md' | 'sm'
  /**
   * Whether the item has unread content. It shows a dot on the icon or image, never a count, and adds "unread" to
   * the item's name. The name is then set as the aria-label, both when expanded and when collapsed.
   */
  dot?: boolean
  /** Who sees this page, for a page only owners or moderators see. A shield follows the label, and the words are the item's description. */
  shield?: string
  /** Names this element for the welcome tour, which points at it (src/tour/steps.ts). */
  tour?: string
  onClick?: () => void
}

/** One item in the NavBar: an icon or an image, plus its label when expanded. */
export function NavItem({
  icon,
  mark,
  label,
  expanded,
  current,
  size = 'md',
  dot = false,
  shield,
  tour,
  onClick,
}: NavItemProps) {
  const tip = useTooltip(label, !expanded, 'right')
  const name = dot ? `${label}, unread` : label
  const glyph = mark ?? (icon && <Icon name={icon} size={20} />)
  return (
    <>
      <button
        ref={tip.ref}
        type="button"
        aria-current={current ? 'page' : undefined}
        aria-label={name === label && expanded ? undefined : name}
        aria-description={shield}
        data-tour={tour}
        className={`group flex cursor-pointer items-center gap-3 rounded-[4px] text-mute transition-colors ${GHOST_HOVER} focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink ${GHOST_CURRENT} ${size === 'sm' ? 'h-8 text-sm' : 'h-10'} ${expanded ? 'px-3' : 'justify-center'}`}
        {...tip.props({ onClick })}
      >
        <Dotted shown={dot}>{glyph}</Dotted>
        {/* The label is ink at regular weight, and the icon stays grey. The current item's label is red, as its icon is. */}
        {expanded && <span className="truncate text-ink group-aria-[current=page]:text-sweet">{label}</span>}
        {expanded && shield !== undefined && <ShieldMark size={16} />}
      </button>
      {tip.tooltip}
    </>
  )
}
