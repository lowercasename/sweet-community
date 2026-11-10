import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface BadgeProps {
  icon: IconName
  children?: ReactNode
}

/**
 * A small round label for a state of the app, such as being offline. It is solid red, so it is not mistaken for a
 * topic pill. It never shrinks, so a title beside it is truncated first. It is 20px tall, shorter than a bar's title
 * line, so showing it does not change the bar's height.
 */
export function Badge({ icon, children }: BadgeProps) {
  return (
    <span
      role="status"
      className="inline-flex h-5 flex-none items-center gap-1 rounded-full bg-sweet px-2 text-xs font-medium whitespace-nowrap text-on-sweet"
    >
      <Icon name={icon} size={14} />
      {children}
    </span>
  )
}
