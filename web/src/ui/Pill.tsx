import type { ReactNode } from 'react'
import { Link as Route } from 'wouter'
import { Icon } from './Icon'

export type PillSize = 'sm' | 'md'

/**
 * The classes of a pill, for the one control that must be a pill but not
 * this component (a Menu's trigger). `topic` is a named topic, in Sweet's
 * blush; `quiet` is a pill with nothing chosen. `sm` is a label on content,
 * the height of its small text; `md` is a control, the height of a button.
 */
export function pillClass(tone: 'topic' | 'quiet', size: PillSize): string {
  const base =
    'inline-flex min-w-0 max-w-full cursor-pointer items-center rounded-full border font-medium whitespace-nowrap ' +
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink disabled:cursor-default'
  const dims = size === 'md' ? 'h-[34px] gap-1.5 px-3 text-[15px]' : 'h-7 gap-1 px-2.5 text-sm'
  const look =
    tone === 'topic'
      ? 'border-blush-line bg-blush text-sweet hover:border-pink'
      : 'border-line bg-card text-mute hover:border-pink hover:text-sweet'
  return `${base} ${dims} ${look}`
}

/** The icon sizes that go with each pill size: the tag, and the chevron of one that opens. */
export const PILL_ICON: Record<PillSize, { tag: 14 | 16; chevron: 14 | 16 }> = {
  sm: { tag: 14, chevron: 14 },
  md: { tag: 16, chevron: 16 },
}

interface PillProps {
  /** A path in the app: the pill is a link there. Else a button, or plain text when nothing happens. */
  href?: string
  onClick?: () => void
  /** Accessible name, when the text alone does not say what it does ("Topic: Practice"). */
  label?: string
  tone?: 'topic' | 'quiet'
  size?: PillSize
  children?: ReactNode
}

/**
 * A topic in a small rounded label (architecture.md, Topics): the one shape a
 * topic ever takes, on a post, at the head of the feed, beside Post. The tag
 * icon is part of the shape, so a topic is known at a glance. A pill that
 * opens a menu is a Menu with the pill trigger, drawn with the same classes.
 */
export function Pill({ href, onClick, label, tone = 'topic', size = 'sm', children }: PillProps) {
  const inner = (
    <>
      <span className="flex-none">
        <Icon name="tag" size={PILL_ICON[size].tag} />
      </span>
      <span className="truncate">{children}</span>
    </>
  )
  if (href !== undefined) {
    return (
      <Route href={href} className={pillClass(tone, size)} aria-label={label}>
        {inner}
      </Route>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={pillClass(tone, size)} aria-label={label} onClick={onClick}>
        {inner}
      </button>
    )
  }
  return (
    <span className={pillClass(tone, size).replace('cursor-pointer ', '')} aria-label={label}>
      {inner}
    </span>
  )
}
