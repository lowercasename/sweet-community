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
import { pillClass } from './Pill'
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
   * button, the three dots. `pill` is a topic pill with a chevron, in the
   * bar and on a post. `graft` is the right half of a primary button, the
   * topic on Post. `text` is a ghost button with words. The last three show
   * `children` as their text.
   */
  trigger?: 'icon' | 'pill' | 'graft' | 'text'
  /** A pill trigger with nothing chosen is quiet. A grafted trigger beside a disabled Post takes its grey, and still opens. */
  quiet?: boolean
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
/** The grafted trigger: the right half of a primary button, sharing its edge. */
const GRAFT_BASE =
  'inline-flex cursor-pointer items-center gap-1 rounded-r-[4px] border border-l-0 py-1 pr-2 pl-2 font-sans text-[inherit] leading-6 font-medium ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink disabled:cursor-default disabled:border-line disabled:bg-line disabled:text-mute'
const GRAFT = `${GRAFT_BASE} border-pink bg-pink text-white hover:border-sweet hover:bg-sweet`
const GRAFT_QUIET = `${GRAFT_BASE} border-line bg-line text-mute hover:text-ink`

export function Menu({
  label,
  icon = 'more',
  items,
  reveal,
  trigger = 'icon',
  quiet = false,
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
      : trigger === 'pill'
        ? pillClass(quiet ? 'quiet' : 'topic')
        : trigger === 'graft'
          ? quiet
            ? GRAFT_QUIET
            : GRAFT
          : buttonClass('ghost', false)

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
            {trigger !== 'pill' && <Icon name="tag" size={16} />}
            {children !== undefined && <span className="truncate">{children}</span>}
            <Icon name="chevron" size={16} />
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
