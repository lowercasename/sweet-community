import type { ReactNode } from 'react'
import { Button } from './Button'
import type { IconName } from './Icon'

interface NavSectionProps {
  /** The section's name: a small title when expanded, the group's accessible name always. */
  title: string
  expanded: boolean
  /** An action that belongs to the section as a whole (New room): in the title row; gone when collapsed, where it took the room of a place (Raphael, 2026-11-06). */
  action?: {
    icon: IconName
    label: string
    current?: boolean
    onClick: () => void
  }
  children?: ReactNode
}

/**
 * A titled block inside the NavBar, for a list of places that grows (the
 * rooms I am in, my conversations). Its control is the section's own, so it
 * never reads as one more page, and is not drawn at all when the bar is
 * collapsed: a plus among the tiles took the room of a place. Its items are
 * the small size and sit with no gap, a stack under the title.
 */
export function NavSection({ title, expanded, action, children }: NavSectionProps) {
  return (
    // pb-1.5: a section's small items carry 4px of air inside them where a full-size item carries 10, so the section ends 6px early to leave the same air before what follows (a rule, another section).
    <div role="group" aria-label={title} className="flex flex-col gap-0 pb-1.5">
      {expanded && (
        <div className="mt-1 flex h-7 items-center justify-between pr-1 pl-3">
          <span className="text-sm font-medium text-dim">{title}</span>
          {action && (
            <Button
              variant="ghost"
              icon={action.icon}
              label={action.label}
              current={action.current}
              onClick={action.onClick}
            />
          )}
        </div>
      )}
      {children}
    </div>
  )
}
