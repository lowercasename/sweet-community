import { forwardRef, type ReactNode, type UIEvent } from 'react'

interface ScrollAreaProps {
  /** `cards` leaves room for card shadows; `inner` is inside a Card. */
  pad?: 'cards' | 'inner'
  onScroll?: (e: UIEvent<HTMLDivElement>) => void
  children?: ReactNode
}

const PADS: Record<NonNullable<ScrollAreaProps['pad']>, string> = {
  cards: 'px-1 pt-1 pb-12',
  inner: 'px-4 py-3',
}

/** The scrolling region of a Pane or Card. The ref is the scroll container. */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { pad = 'cards', onScroll, children },
  ref,
) {
  return (
    <div
      ref={ref}
      data-scroll
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${PADS[pad]}`}
      onScroll={onScroll}
    >
      {children}
    </div>
  )
})
