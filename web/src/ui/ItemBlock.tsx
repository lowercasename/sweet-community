import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from 'react'
import { autoUpdate, flip, hide, offset, shift, useFloating, useMergeRefs } from '@floating-ui/react'

interface ItemBlockProps {
  /** The element id, so a reply's quote can scroll to this message. */
  id?: string
  /** The item's actions, drawn in a small bar over the block's top right corner. */
  actions?: ReactNode
  /** True while a menu or picker opened from the actions is open. The bar then stays shown. */
  actionsOpen?: boolean
  /** Briefly true after a reply's quote was clicked, to show which message it answers. */
  highlight?: boolean
  children?: ReactNode
}

// CSS follows hover and keyboard focus even when a focused reaction button is removed.
// Hidden bars keep their dimensions so Floating UI can position them before they appear.
const HIDDEN =
  'pointer-events-none pointer-fine:opacity-0 ' +
  'pointer-fine:[.block-item:hover_&]:pointer-events-auto pointer-fine:[.block-item:hover_&]:opacity-100 ' +
  'pointer-fine:[.block-item:has(:focus-visible)_&]:pointer-events-auto pointer-fine:[.block-item:has(:focus-visible)_&]:opacity-100 ' +
  'pointer-coarse:invisible pointer-coarse:[.block-item[data-selected]_&]:visible ' +
  'pointer-coarse:[.block-item[data-selected]_&]:pointer-events-auto'

/** How long a press on a touch screen lasts before it counts as pressing and holding, in milliseconds. */
export const HOLD = 500

/**
 * One chat message or one comment, with its actions in a small bar that floats over the block's top right corner, as
 * in Discord. With a pointer, the bar shows on hover or keyboard focus. On a touch screen, a tap on
 * the block selects it and shows the bar. A tap on a link, a button or an image in the block does what it does
 * instead, so pressing and holding a link or an image selects the block. A second tap on the block, or a press
 * anywhere outside it, clears the selection. A visually hidden Actions button does the same for a screen reader on a
 * touch screen. The block gets a soft blush background while hovered or selected, and full blush while highlighted.
 */
export function ItemBlock({ id, actions, actionsOpen = false, highlight = false, children }: ItemBlockProps) {
  const [selected, setSelected] = useState(false)
  const { refs, elements, floatingStyles, middlewareData, update } = useFloating({
    placement: 'top-end',
    middleware: [
      offset(({ rects }) => (window.matchMedia('(pointer: coarse)').matches ? 4 : -rects.floating.height / 2)),
      flip({ padding: 4 }),
      shift({ padding: 4, crossAxis: true }),
      hide(),
    ],
  })
  const ref = useRef<HTMLDivElement>(null)
  const setRef = useMergeRefs([ref, refs.setReference])
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!elements.reference || !elements.floating) return
    return autoUpdate(elements.reference, elements.floating, update)
  }, [elements.reference, elements.floating, update])
  // True after pressing and holding selected the block. The click that ends the press is then dropped, so the link
  // or image does not open.
  const held = useRef(false)
  useEffect(() => {
    if (!selected) return
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setSelected(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [selected])
  const linkOrImage = (target: EventTarget) =>
    actions !== undefined &&
    !!(target as Element).closest('a, img') &&
    !(target as Element).closest('[data-action-bar]')
  const press = (e: TouchEvent<HTMLDivElement>) => {
    held.current = false
    if (!linkOrImage(e.target)) return
    timer.current = window.setTimeout(() => {
      held.current = true
      setSelected(true)
    }, HOLD)
  }
  const release = () => window.clearTimeout(timer.current)
  const dropHeldClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!held.current) return
    held.current = false
    e.preventDefault()
    e.stopPropagation()
  }
  const tap = (e: MouseEvent<HTMLDivElement>) => {
    if (!actions || !window.matchMedia('(pointer: coarse)').matches) return
    // A click in a portalled picker reaches this handler through React, but is not inside the block.
    const target = e.target as Element
    if (!e.currentTarget.contains(target) || target.closest('a, button, input, textarea, img, [data-action-bar]'))
      return
    setSelected((s) => !s)
  }
  return (
    <div
      ref={setRef}
      id={id}
      data-selected={selected || undefined}
      onClick={tap}
      onClickCapture={dropHeldClick}
      onTouchStart={press}
      onTouchEnd={release}
      onTouchMove={release}
      onTouchCancel={release}
      onContextMenu={(e) =>
        linkOrImage(e.target) && window.matchMedia('(pointer: coarse)').matches && e.preventDefault()
      }
      className={`block-item relative pointer-coarse:[&_a,&_img]:[-webkit-touch-callout:none] -mx-2 scroll-mt-4 rounded-[4px] px-2 py-0.5 transition-colors duration-500 hover:bg-blush-soft data-[selected]:bg-blush-soft ${highlight ? 'bg-blush' : ''}`}
    >
      {children}
      {actions && (
        <button
          type="button"
          className="sr-only pointer-fine:hidden"
          aria-expanded={selected}
          onClick={() => setSelected((now) => !now)}
        >
          Actions
        </button>
      )}
      {actions && (
        <div
          data-action-bar
          ref={refs.setFloating}
          style={{ ...floatingStyles, visibility: middlewareData.hide?.referenceHidden ? 'hidden' : undefined }}
          className={`absolute z-10 flex items-center gap-px rounded-[6px] border border-line bg-card p-px shadow-sm ${actionsOpen ? '' : HIDDEN}`}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
