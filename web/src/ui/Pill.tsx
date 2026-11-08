import type { ReactNode } from 'react'
import { Link as Route } from 'wouter'
import { Icon } from './Icon'

export type PillSize = 'sm' | 'md'

/**
 * The classes of a pill, for the one control that must look like a pill but
 * is not this component (a Menu's trigger). `topic` is a chosen topic, in
 * Sweet's blush colour. `quiet` is a pill with nothing chosen. `sm` is a label
 * on content, the height of its small text. `md` is a control, the height of
 * a button.
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

/** The icon sizes for each pill size. The tag icon, and the chevron of a pill that opens a menu. */
export const PILL_ICON: Record<PillSize, { tag: 14 | 16; chevron: 14 | 16 }> = {
  sm: { tag: 14, chevron: 14 },
  md: { tag: 16, chevron: 16 },
}

interface PillProps {
  /** A path in the app. When set, the pill is a link to it. Otherwise the pill is a button if `onClick` is set, or plain text. */
  href?: string
  onClick?: () => void
  /** Accessible name, for when the text alone does not describe the pill, for example "Topic: Practice". */
  label?: string
  tone?: 'topic' | 'quiet'
  size?: PillSize
  children?: ReactNode
}

/**
 * A topic as a small rounded label (architecture.md, Topics). This is the only
 * shape a topic takes, on a post, at the top of the feed, and beside the Post
 * button. The tag icon is part of the shape, so a topic is recognisable at a
 * glance. A pill that opens a menu is a Menu with the pill trigger, which uses
 * the same classes.
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

/**
 * A line of text under a control pill, such as a topic's description. Small
 * and muted, indented a few pixels from the pill's rounded edge so that it
 * sits under the pill's text rather than against the card's edge.
 */
export function PillCaption({ children }: { children?: ReactNode }) {
  return <p className="m-0 pl-2 text-sm leading-snug text-mute [overflow-wrap:anywhere]">{children}</p>
}
