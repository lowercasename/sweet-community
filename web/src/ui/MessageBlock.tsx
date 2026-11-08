import type { ReactNode } from 'react'

interface MessageBlockProps {
  /** The message's menu. Positioned absolutely at the block's top right, regardless of the body's height. */
  menu?: ReactNode
  children?: ReactNode
}

/**
 * One message in a run (architecture.md, Chat). The body is rendered with
 * space reserved on the right for the menu, which is positioned at the top
 * right regardless of how tall the body is or how much it wraps. The block
 * gets a blush background on hover. It has the `block-message` class, so a
 * revealed Menu inside it shows while the block is hovered.
 */
export function MessageBlock({ menu, children }: MessageBlockProps) {
  return (
    <div className="block-message relative -mx-2 rounded-[4px] px-2 py-0.5 pr-10 hover:bg-blush">
      {children}
      {menu && <div className="absolute top-0 right-1">{menu}</div>}
    </div>
  )
}
