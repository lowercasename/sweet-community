import { forwardRef, type ReactNode, type UIEvent } from 'react'

interface ScrollAreaProps {
  /** `cards` is for a column of cards on the page background. `inner` is for content inside a Card. */
  pad?: 'cards' | 'inner'
  onScroll?: (e: UIEvent<HTMLDivElement>) => void
  /** Shown after the content. When the content is shorter than the area, it sits at the bottom of the area. */
  foot?: ReactNode
  children?: ReactNode
}

// `cards` supplies the pane's top and bottom margin, so the margin scrolls with the content and the pane runs edge
// to edge.
const PADS: Record<NonNullable<ScrollAreaProps['pad']>, string> = {
  cards: 'px-1 py-4',
  inner: 'px-4 py-3',
}

/** The scrolling region of a Pane or Card. The ref is the scroll container. */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { pad = 'cards', onScroll, foot, children },
  ref,
) {
  const cls = `min-h-0 flex-1 overflow-y-auto overscroll-contain ${PADS[pad]}`
  if (foot === undefined) {
    return (
      <div ref={ref} data-scroll className={cls} onScroll={onScroll}>
        {children}
      </div>
    )
  }
  // A column whose foot has an automatic top margin. The margin takes the space left under short content and is
  // zero when the content overflows.
  return (
    <div ref={ref} data-scroll className={`${cls} flex flex-col`} onScroll={onScroll}>
      <div className="flex-none">{children}</div>
      <div className="mt-auto flex-none">{foot}</div>
    </div>
  )
})
