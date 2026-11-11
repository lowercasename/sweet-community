import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

export const SPLIT_MIN = 0.25
export const SPLIT_MAX = 0.6
export const SPLIT_DEFAULT = 0.4
const COLLAPSE_LEFT_AT = 0.12
const COLLAPSE_RIGHT_AT = 0.88

export type SplitShow = 'both' | 'left' | 'right'

interface SplitProps {
  /** Width of the left pane as a fraction of the whole. */
  ratio: number
  onRatio: (ratio: number) => void
  /** Called when the handle is dragged, or moved with the keyboard, past a pane's edge. */
  onCollapse: (side: 'left' | 'right') => void
  /** Which panes are open. A closed pane stays mounted but hidden, so its scroll position and its uploads are kept. */
  show: SplitShow
  /** Rendered in place of a closed pane. A Rail. Omit on narrow screens, where the tab bar reopens panes instead. */
  leftRail?: ReactNode
  rightRail?: ReactNode
  /** Hide the whole split while keeping everything in it mounted. Used while another page is showing. */
  hidden?: boolean
  /** Names the divider for the welcome tour, which points at it (src/tour/steps.ts). */
  tour?: string
  left: ReactNode
  right: ReactNode
}

/**
 * Two panes with a draggable divider. Dragging resizes the panes. Dragging far
 * enough collapses the pane on that side, and the page renders a Rail in its
 * place. With the keyboard, the arrow keys resize, Home and End collapse, and
 * double-click resets the ratio.
 *
 * Both panes are always in the React tree, whichever is shown, so closing and
 * reopening a pane, or visiting another page, never loses the text being typed
 * in it. The children also keep their positions in the tree. A conditional
 * child renders as an empty slot, not a shift of the other children.
 */
export function Split({
  ratio,
  onRatio,
  onCollapse,
  show,
  leftRail,
  rightRail,
  hidden,
  tour,
  left,
  right,
}: SplitProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  // The ratio before the current drag began. A drag that ends in a collapse
  // must not leave the pane at its minimum width when it is reopened.
  const startRatio = useRef(ratio)

  const collapse = (side: 'left' | 'right') => {
    dragging.current = false
    onRatio(startRatio.current)
    onCollapse(side)
  }

  const ratioAt = (clientX: number): number | null => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return (clientX - rect.left) / rect.width
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    startRatio.current = ratio
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const r = ratioAt(e.clientX)
    if (r == null) return
    if (r < COLLAPSE_LEFT_AT) {
      collapse('left')
    } else if (r > COLLAPSE_RIGHT_AT) {
      collapse('right')
    } else {
      onRatio(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, r)))
    }
  }
  const onPointerUp = () => {
    dragging.current = false
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') onRatio(Math.max(SPLIT_MIN, ratio - 0.02))
    else if (e.key === 'ArrowRight') onRatio(Math.min(SPLIT_MAX, ratio + 0.02))
    else if (e.key === 'Home') onCollapse('left')
    else if (e.key === 'End') onCollapse('right')
    else return
    e.preventDefault()
  }

  // A hidden pane has no grid column, and neither does an absent rail (on
  // phones), so the grid columns match exactly what is on screen.
  const columns =
    show === 'both'
      ? `minmax(0, ${ratio}fr) 16px minmax(0, ${1 - ratio}fr)`
      : show === 'left'
        ? rightRail
          ? 'minmax(0, 1fr) auto'
          : 'minmax(0, 1fr)'
        : leftRail
          ? 'auto minmax(0, 1fr)'
          : 'minmax(0, 1fr)'

  return (
    <div ref={ref} className={hidden ? 'hidden' : 'grid min-h-0 flex-1'} style={{ gridTemplateColumns: columns }}>
      {show === 'right' && leftRail}
      <div className={show === 'right' ? 'hidden' : 'contents'}>{left}</div>
      {show === 'both' && (
        <div
          role="separator"
          data-tour={tour}
          aria-orientation="vertical"
          aria-label="Resize panes"
          aria-valuemin={Math.round(SPLIT_MIN * 100)}
          aria-valuemax={Math.round(SPLIT_MAX * 100)}
          aria-valuenow={Math.round(ratio * 100)}
          tabIndex={0}
          className="group relative flex cursor-col-resize touch-none items-center justify-center select-none focus-visible:outline-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => onRatio(SPLIT_DEFAULT)}
          onKeyDown={onKeyDown}
        >
          <span
            aria-hidden
            className="absolute inset-y-2 w-0.5 rounded-full bg-input opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100"
          />
          <span className="relative h-10 w-1 rounded-full bg-line transition-[background-color,height] group-hover:h-16 group-hover:bg-sweet group-focus-visible:bg-sweet group-active:bg-sweet" />
        </div>
      )}
      <div className={show === 'left' ? 'hidden' : 'contents'}>{right}</div>
      {show === 'left' && rightRail}
    </div>
  )
}
