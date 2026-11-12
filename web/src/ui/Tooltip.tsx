import { useState, type HTMLProps, type ReactNode } from 'react'
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react'

/**
 * A tooltip for a control whose name is not visible, such as a collapsed nav
 * item, an icon button or a menu trigger. The tooltip shows the name on hover
 * or keyboard focus. It is positioned by Floating UI and portalled to the body.
 * The browser's title attribute is not used because it is slow and unstyled.
 * The control passes `ref` to its element, spreads `props` onto it (passing its
 * own handlers through `props` so they are merged), and renders `tooltip` next
 * to itself. Nothing happens while `enabled` is false.
 */
// `wide` lets a long label, such as the people who chose a reaction, wrap at 16rem.
export function useTooltip(label: string, enabled: boolean, placement: Placement = 'bottom', wide = false) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open: open && enabled,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const hover = useHover(context, { enabled, mouseOnly: true, delay: { open: 400, close: 0 } })
  const focus = useFocus(context, { enabled })
  const dismiss = useDismiss(context, { enabled })
  const role = useRole(context, { enabled, role: 'tooltip' })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role])
  const tooltip: ReactNode = open && enabled && (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className={`z-50 rounded-[4px] bg-ink px-2 py-1 text-xs font-medium text-paper ${wide ? 'max-w-64' : 'whitespace-nowrap'}`}
        {...getFloatingProps()}
      >
        {label}
      </div>
    </FloatingPortal>
  )
  return {
    ref: refs.setReference,
    props: (own?: HTMLProps<HTMLElement>) => getReferenceProps(own),
    tooltip,
    /** Opens the tooltip, for a press and hold on a touch screen. */
    show: () => setOpen(true),
  }
}
