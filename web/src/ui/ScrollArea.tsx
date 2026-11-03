import { forwardRef, type ReactNode, type UIEvent } from 'react'
import styles from './ScrollArea.module.css'

interface ScrollAreaProps {
  onScroll?: (e: UIEvent<HTMLDivElement>) => void
  children?: ReactNode
}

/** The scrolling region of a Pane. The ref is the scroll container. */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea({ onScroll, children }, ref) {
  return (
    <div ref={ref} className={styles.scroll} onScroll={onScroll}>
      {children}
    </div>
  )
})
