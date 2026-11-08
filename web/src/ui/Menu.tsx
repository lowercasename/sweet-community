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
  /** A second, muted line under the label. Used for a topic's description. */
  detail?: string
  /** For a choice among several items. The chosen item is marked with a check. */
  checked?: boolean
  /** An item that removes something. Shown in red. */
  danger?: boolean
  onSelect: () => void
}

interface MenuProps {
  /** Accessible name of the trigger, for example "Post options". */
  label: string
  icon?: IconName
  items: MenuItem[]
  /**
   * The trigger's appearance. `icon` (the default) is a ghost icon button
   * showing three dots. `pill` is a topic pill with a chevron, used wherever
   * a topic is chosen, with `children` as its text.
   */
  trigger?: 'icon' | 'pill'
  /** Use the quiet pill style, for a pill with nothing chosen. */
  quiet?: boolean
  /** A pill trigger's size. `sm` is a label among content. `md` is a control among controls. */
  size?: PillSize
  disabled?: boolean
  children?: ReactNode
  /**
   * Hide the trigger until its block is hovered or contains focus, on devices
   * with a pointer. On a touch screen it is always shown. It is also shown
   * while the menu is open. The value names the level of block, because a post
   * contains its comments. A post's menu shows while its card is hovered and no
   * comment inside it is hovered. A comment's menu shows while its own article
   * is hovered. A message's menu shows while its own row is hovered.
   */
  reveal?: 'post' | 'comment' | 'message'
}

/**
 * The classes that hide a revealed menu until its block is hovered or focused, on devices with a pointer only. The
 * blocks have the classes `block-post` (Card as article), `block-comment` (Box as article) and `block-message`
 * (MessageBlock).
 */
const REVEAL: Record<NonNullable<MenuProps['reveal']>, string> = {
  post: 'pointer-fine:opacity-0 pointer-fine:[.block-post:hover:not(:has(.block-comment:hover))_&]:opacity-100 pointer-fine:[.block-post:focus-within:not(:has(.block-comment:focus-within))_&]:opacity-100',
  comment:
    'pointer-fine:opacity-0 pointer-fine:[.block-comment:hover_&]:opacity-100 pointer-fine:[.block-comment:focus-within_&]:opacity-100',
  message:
    'pointer-fine:opacity-0 pointer-fine:[.block-message:hover_&]:opacity-100 pointer-fine:[.block-message:focus-within_&]:opacity-100',
}

/**
 * A three-dot menu. A ghost icon button that opens a short list of actions.
 * Floating UI positions the list, keeps it inside its pane (flipping upwards
 * near the bottom), closes it on Escape or a click outside, and moves through
 * the items with the arrow keys. The list is rendered next to its button, not
 * portalled to the body, so it scrolls with the button and is clipped by the
 * pane's edge. This means it never needs to close on scroll. Closing on scroll
 * once closed the menu one frame after it opened.
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
      ? `${buttonClass('ghost', true, false, reveal === 'message')} ${reveal && !open ? REVEAL[reveal] : ''}`
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
                  className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-field focus:bg-field focus:outline-none ${item.checked || item.danger ? 'text-sweet' : 'text-ink'}`}
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
