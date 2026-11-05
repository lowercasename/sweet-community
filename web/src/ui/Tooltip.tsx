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
 * A control whose name is hidden (a collapsed nav item, an icon button, a
 * menu's trigger) says it in a tooltip on hover or keyboard focus, drawn by
 * Floating UI and portalled to the body, never the browser's title, which
 * is slow and unstyled. The control takes `ref` and spreads `props` onto
 * itself, merging its own handlers through it, and renders `tooltip` beside
 * itself. Nothing happens while `enabled` is false.
 */
export function useTooltip(label: string, enabled: boolean, placement: Placement = 'bottom') {
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
        className="z-50 rounded-[4px] bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-paper"
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
  }
}
