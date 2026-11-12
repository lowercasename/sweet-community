import type { ReactNode } from 'react'

interface MessageBlockProps {
  /** The element id, so a reply's quote can scroll to this message. */
  id?: string
  /** The message's actions (Reply and its menu). Positioned at the block's top right, regardless of the body's height. */
  menu?: ReactNode
  time?: ReactNode
  /** Briefly true after a reply's quote was clicked, to show which message it answers. */
  highlight?: boolean
  children?: ReactNode
}

/**
 * One message in a run. The body is rendered with
 * space reserved on the right for the actions, which are positioned at the top
 * right regardless of how tall the body is or how much it wraps. The block
 * gets a soft blush background on hover, and full blush while highlighted. It
 * has the `block-message` class, so a revealed control inside it shows while
 * the block is hovered.
 */
export function MessageBlock({ id, menu, time, highlight = false, children }: MessageBlockProps) {
  return (
    <div
      id={id}
      className={`block-message relative -mx-2 scroll-mt-4 rounded-[4px] px-2 py-0.5 pr-16 transition-colors duration-500 hover:bg-blush-soft ${highlight ? 'bg-blush' : ''}`}
    >
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        {time && <span className="shrink-0 pb-1 text-xs text-mute">{time}</span>}
      </div>
      {menu && <div className="absolute top-px right-1 flex items-center">{menu}</div>}
    </div>
  )
}
