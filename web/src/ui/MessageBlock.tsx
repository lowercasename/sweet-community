import type { ReactNode } from 'react'

interface MessageBlockProps {
  /** The message's menu, floated at the block's top right, whatever the body's height. */
  menu?: ReactNode
  children?: ReactNode
}

/**
 * One message in a run (architecture.md, Chat): its body with room kept on
 * the right for its menu, which floats at the top right however tall the
 * body is or however much it wraps; the block takes a blush when hovered.
 * It is a `block-message`, so a revealed Menu inside shows while it is hovered.
 */
export function MessageBlock({ menu, children }: MessageBlockProps) {
  return (
    <div className="block-message relative -mx-2 rounded-[4px] px-2 py-0.5 pr-10 hover:bg-blush">
      {children}
      {menu && <div className="absolute top-0 right-1">{menu}</div>}
    </div>
  )
}
