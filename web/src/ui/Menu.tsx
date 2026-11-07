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
  useMergeRefs,
  useRole,
} from '@floating-ui/react'
import type { ReactNode } from 'react'
import { buttonClass } from './Button'
import { Icon, type IconName } from './Icon'
import { PILL_ICON, pillClass, type PillSize } from './Pill'
import { useTooltip } from './Tooltip'

export interface MenuItem {
  label: string
  icon?: IconName
  /** A second, quieter line under the label: a topic's description. */
  detail?: string
  /** A choice among several: the chosen one is marked. */
  checked?: boolean
  onSelect: () => void
}

interface MenuProps {
  /** Accessible name of the trigger, e.g. "Post options". */
  label: string
  icon?: IconName
  items: MenuItem[]
  /**
   * What the trigger looks like. `icon` (the default) is a ghost icon
   * button, the three dots. `pill` is a topic pill with a chevron, wherever
   * a topic is chosen, showing `children` as its text.
   */
  trigger?: 'icon' | 'pill'
  /** A pill with nothing chosen is quiet. */
  quiet?: boolean
  /** A pill trigger's size: a label among content, or a control among controls. */
  size?: PillSize
  disabled?: boolean
  children?: ReactNode
  /**
   * Out of sight until its own block is hovered or holds focus, where there
   * is a pointer to hover with; always shown on a touch screen, and while
   * open. The block is named by level, since a post holds its comments: a
   * post's menu shows while its card is hovered and no comment in it is; a
   * comment's while its own article is; a message's while its own row is.
   */
  reveal?: 'post' | 'comment' | 'message'
}

/**
 * The classes that hide a revealed menu until its block is hovered or focused, on pointer screens only. The blocks
 * are marked `block-post` (Card as article), `block-comment` (Box as article) and `block-message` (MessageBlock).
 */
const REVEAL: Record<NonNullable<MenuProps['reveal']>, string> = {
  post: 'pointer-fine:opacity-0 pointer-fine:[.block-post:hover:not(:has(.block-comment:hover))_&]:opacity-100 pointer-fine:[.block-post:focus-within:not(:has(.block-comment:focus-within))_&]:opacity-100',
  comment:
    'pointer-fine:opacity-0 pointer-fine:[.block-comment:hover_&]:opacity-100 pointer-fine:[.block-comment:focus-within_&]:opacity-100',
  message:
    'pointer-fine:opacity-0 pointer-fine:[.block-message:hover_&]:opacity-100 pointer-fine:[.block-message:focus-within_&]:opacity-100',
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
export function Menu({
  label,
  icon = 'more',
  items,
  reveal,
  trigger = 'icon',
  quiet = false,
  size = 'md',
  disabled,
  children,
}: MenuProps) {
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
  const tip = useTooltip(label, !open && trigger === 'icon')
  const triggerRef = useMergeRefs([refs.setReference, tip.ref])
  const triggerClass =
    trigger === 'icon'
      ? `${buttonClass('ghost', true)} ${reveal && !open ? REVEAL[reveal] : ''}`
      : pillClass(quiet ? 'quiet' : 'topic', size)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        {...getReferenceProps(tip.props())}
      >
        {trigger === 'icon' ? (
          <Icon name={icon} />
        ) : (
          <>
            <span className="flex-none">
              <Icon name="tag" size={PILL_ICON[size].tag} />
            </span>
            <span className="truncate">{children}</span>
            <span className="flex-none">
              <Icon name="chevron" size={PILL_ICON[size].chevron} />
            </span>
          </>
        )}
      </button>
      {tip.tooltip}
      {open && (
        <>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-50 max-h-80 min-w-40 max-w-80 overflow-y-auto rounded-[4px] border border-line bg-card py-1"
              {...getFloatingProps()}
            >
              {items.map((item, i) => (
                <button
                  key={item.label}
                  ref={(el) => {
                    listRef.current[i] = el
                  }}
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={item.checked}
                  tabIndex={activeIndex === i ? 0 : -1}
                  className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-field focus:bg-field focus:outline-none ${item.checked ? 'text-sweet' : 'text-ink'}`}
                  {...getItemProps({
                    onClick() {
                      setOpen(false)
                      item.onSelect()
                    },
                  })}
                >
                  {item.icon && <Icon name={item.icon} />}
                  {item.detail ? (
                    <span className="flex min-w-0 flex-col">
                      <span>{item.label}</span>
                      <span className="text-sm text-mute">{item.detail}</span>
                    </span>
                  ) : (
                    item.label
                  )}
                  {item.checked && (
                    <span className="ml-auto">
                      <Icon name="check" size={16} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </>
      )}
    </>
  )
}
