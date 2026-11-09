import { Children, type ReactNode } from 'react'
import { Button } from './Button'
import type { IconName } from './Icon'

interface NavSectionProps {
  /** The section's name. Shown as a small title when expanded. Always the group's accessible name. */
  title: string
  expanded: boolean
  /** An action for the section as a whole, such as New room. Shown in the title row. Not shown when collapsed, where it took the space of a group item (Raphael, 2026-11-06). */
  action?: {
    icon: IconName
    label: string
    current?: boolean
    onClick: () => void
  }
  /** Names the section's title row for the welcome tour, which points at it (src/tour/steps.ts). */
  tour?: string
  children?: ReactNode
}

/**
 * A titled block inside the NavBar, for a list of groups that grows, such as
 * the rooms the user is in or the user's conversations. Its action control
 * belongs to the section, so it does not look like another page, and it is not
 * rendered when the bar is collapsed, because a plus icon among the tiles took
 * the space of a group item. Its items use the small size and have no gap
 * between them, as a stack under the title.
 */
export function NavSection({ title, expanded, action, tour, children }: NavSectionProps) {
  // When collapsed, a section with no items renders nothing. Rendering only its padding left a gap in the bar.
  if (!expanded && Children.toArray(children).length === 0) return null
  return (
    // pb-1.5: a small item has 4px of vertical padding and a full-size item has 10px, so the section ends 6px early to
    // leave the same space before whatever follows it, such as a rule or another section.
    <div role="group" aria-label={title} className="flex flex-col gap-0 pb-1.5">
      {expanded && (
        <div data-tour={tour} className="mt-1 flex h-7 items-center justify-between pr-1 pl-3">
          <span className="text-sm font-medium text-mute">{title}</span>
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
