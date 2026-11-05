import { useRef, useState } from 'react'
import {
  FloatingFocusManager,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react'
import { buttonClass } from './Button'
import { Icon, type IconName } from './Icon'

export interface MenuItem {
  label: string
  icon?: IconName
  onSelect: () => void
}

interface MenuProps {
  /** Accessible name of the trigger, e.g. "Post options". */
  label: string
  icon?: IconName
  items: MenuItem[]
}

/**
 * A three-dot menu: a ghost icon button that opens a short list of actions.
 * Floating UI positions it, keeps it inside the pane it is in (flipping up
 * near the bottom), closes it on Escape or an outside click, and moves
 * through the items with the arrow keys. It is rendered where its button
 * is, not portalled to the body, so it scrolls with the button and is
 * clipped by the pane's edge; it never needs to close on scroll, which once
 * shut it one frame after it opened.
 */
export function Menu({ label, icon = 'more', items }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<(HTMLElement | null)[]>([])

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'menu' })
  const listNav = useListNavigation(context, { listRef, activeIndex, onNavigate: setActiveIndex, loop: true })
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([click, dismiss, role, listNav])

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        className={buttonClass('ghost', true)}
        aria-label={label}
        title={label}
        {...getReferenceProps()}
      >
        <Icon name={icon} />
      </button>
      {open && (
        <>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-50 min-w-40 rounded-[4px] border border-line bg-card py-1"
              {...getFloatingProps()}
            >
              {items.map((item, i) => (
                <button
                  key={item.label}
                  ref={(el) => {
                    listRef.current[i] = el
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={activeIndex === i ? 0 : -1}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-field focus:bg-field focus:outline-none"
                  {...getItemProps({
                    onClick() {
                      setOpen(false)
                      item.onSelect()
                    },
                  })}
                >
                  {item.icon && <Icon name={item.icon} />}
                  {item.label}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </>
      )}
    </>
  )
}
