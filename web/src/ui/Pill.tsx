import type { ReactNode } from 'react'
import { Link as Route } from 'wouter'
import { Icon } from './Icon'

/**
 * The classes of a pill, for the one control that must be a pill but not
 * this component (a Menu's trigger). `topic` is a named topic, in Sweet's
 * blush; `quiet` is the bar's pill when nothing is chosen.
 */
export function pillClass(tone: 'topic' | 'quiet'): string {
  const base =
    'inline-flex h-6 max-w-full cursor-pointer items-center gap-1 rounded-full border px-2 text-[13px] font-medium whitespace-nowrap ' +
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink'
  return tone === 'topic'
    ? `${base} border-blush-line bg-blush text-sweet hover:border-pink`
    : `${base} border-line bg-card text-mute hover:border-pink hover:text-sweet`
}

interface PillProps {
  /** A path in the app: the pill is a link there. Else a button, or plain text when nothing happens. */
  href?: string
  onClick?: () => void
  /** Accessible name, when the text alone does not say what it does ("Topic: Practice"). */
  label?: string
  tone?: 'topic' | 'quiet'
  /** A chevron after the text: the pill opens a menu. */
  chevron?: boolean
  children?: ReactNode
}

/** A topic's name in a small rounded label (architecture.md, Topics): on a post, in the bar, on the Post button. */
export function Pill({ href, onClick, label, tone = 'topic', chevron = false, children }: PillProps) {
  const inner = (
    <>
      <span className="truncate">{children}</span>
      {chevron && <Icon name="chevron" size={16} />}
    </>
  )
  if (href !== undefined) {
    return (
      <Route href={href} className={pillClass(tone)} aria-label={label}>
        {inner}
      </Route>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={pillClass(tone)} aria-label={label} onClick={onClick}>
        {inner}
      </button>
    )
  }
  return (
    <span className={pillClass(tone).replace('cursor-pointer ', '')} aria-label={label}>
      {inner}
    </span>
  )
}
