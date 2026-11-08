import { useState, type ReactNode } from 'react'
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'

interface HoverCardProps {
  /** The user's name. It is the trigger's accessible name, and the dialog is named "About <name>". */
  name: string
  /** The card's content. */
  card: ReactNode
  /** The trigger's content. The name as displayed, with the user's avatar before it where one is shown. */
  children?: ReactNode
  /** A smaller font size than the running text. Used for a comment's author. */
  small?: boolean
}

const TRIGGER =
  'inline-flex cursor-pointer items-center gap-2 appearance-none rounded-[2px] border-0 bg-transparent p-0 text-left font-sans text-[inherit] leading-[inherit] ' +
  'font-medium text-sweet [overflow-wrap:anywhere] underline-offset-2 hover:underline ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink'

/**
 * A user's name that opens a card about the user. The card opens on hover
 * after a short delay, on keyboard focus, or on a tap or click, since phones
 * have no hover. The pointer may move from the name into the card
 * (safePolygon), because the card contains a button. Floating UI positions
 * the card. It is portalled to the body so that no pane clips it and no
 * heading contains it, and autoUpdate keeps it next to the name while the
 * pane scrolls. Escape, a press outside, or leaving both the name and the
 * card closes it.
 */
export function HoverCard({ name, card, children, small = false }: HoverCardProps) {
  const [open, setOpen] = useState(false)
  const [scrollPane, setScrollPane] = useState<Element | null>(null)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    // The card flips above the name when the name's scroll pane has no room below it. The card is portalled to
    // the body, so the pane is not one of its clipping ancestors and must be passed as the boundary.
    middleware: [offset(6), flip({ boundary: scrollPane ?? undefined, padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const hover = useHover(context, { mouseOnly: true, delay: { open: 250, close: 150 }, handleClose: safePolygon() })
  const focus = useFocus(context)
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role])

  return (
    <>
      <button
        ref={(el) => {
          refs.setReference(el)
          setScrollPane(el?.closest('[data-scroll]') ?? null)
        }}
        type="button"
        className={small ? `${TRIGGER} text-[15px]` : TRIGGER}
        aria-label={name}
        {...getReferenceProps()}
      >
        {children}
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-card p-3"
              aria-label={`About ${name}`}
              {...getFloatingProps()}
            >
              {card}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
