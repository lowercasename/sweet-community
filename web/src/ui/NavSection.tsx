import type { ReactNode } from 'react'
import { Button } from './Button'
import type { IconName } from './Icon'
import { NavItem } from './NavItem'

interface NavSectionProps {
  /** The section's name: a small title when expanded, the group's accessible name always. */
  title: string
  expanded: boolean
  /** An action that belongs to the section as a whole (New group): in the title row, or an item closing the block when collapsed. */
  action?: { icon: IconName; label: string; current?: boolean; onClick: () => void }
  children?: ReactNode
}

/**
 * A titled block inside the NavBar, for a list of places that grows (the
 * groups I am in). Its control is the section's own, so it never reads as
 * one more page.
 */
export function NavSection({ title, expanded, action, children }: NavSectionProps) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-1">
      {expanded && (
        <div className="mt-1 flex h-7 items-center justify-between pr-1 pl-3">
          <span className="text-[11px] font-medium tracking-[0.08em] text-mute uppercase">{title}</span>
          {action && <Button variant="ghost" icon={action.icon} label={action.label} onClick={action.onClick} />}
        </div>
      )}
      {children}
      {!expanded && action && (
        <NavItem
          icon={action.icon}
          label={action.label}
          expanded={false}
          current={action.current}
          onClick={action.onClick}
        />
      )}
    </div>
  )
}
