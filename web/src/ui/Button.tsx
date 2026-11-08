import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { useTooltip } from './Tooltip'

interface ButtonProps {
  /**
   * The four variants (architecture.md, Interface). `primary` is the main action of a surface, filled red. `secondary` is any
   * other action, outlined. `ghost` is a quiet action, a toggle, a menu trigger or Cancel. `danger` removes something
   * that cannot simply be undone: outlined in red, always with an icon.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
  /** True while the action runs. The button is disabled, shows a spinner and keeps its label and colour. */
  busy?: boolean
  /** The 26px icon-only size, for a control inside a chat message line. */
  compact?: boolean
  /** Hide the button until its block is hovered or focused, on devices with a pointer, like a revealed menu. */
  reveal?: 'post' | 'comment' | 'message'
  /** For a toggle button. Whether the toggle is on (aria-pressed). */
  pressed?: boolean
  /** Whether this button opens the page being viewed (aria-current). Used for a nav section's action control. */
  current?: boolean
  /** Accessible name. Required when the button has no text. */
  label?: string
  icon?: IconName
  /** A small number shown after the icon, as old Sweet's post toolbar showed comment counts. Hidden when 0. */
  count?: number
  onClick?: () => void
  /** Called when the pointer enters or leaves. A toggle shows its action (Unsubscribe) instead of its state (Subscribed) while hovered. */
  onHoverChange?: (hovered: boolean) => void
  /**
   * Every label a toggle can show. The button reserves the width of the longest, so it does not change size when its
   * label changes on hover, and the text beside it does not re-wrap.
   */
  labels?: string[]
  children?: ReactNode
}

// Every button is 34px tall: 15px text on a 22px line with 5px padding, or 7px padding around an 18px icon, plus a
// 1px border.
const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-[4px] font-sans text-[15px] leading-[22px] ' +
  'cursor-pointer appearance-none transition-colors duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink disabled:cursor-default'

/**
 * The classes that hide a revealed control (a menu trigger or a reply button) until its block is hovered or focused, on devices with a pointer only. The
 * blocks have the classes `block-post` (Card as article), `block-comment` (Box as article) and `block-message`
 * (MessageBlock).
 */
export const REVEAL: Record<'post' | 'comment' | 'message', string> = {
  post: 'pointer-fine:opacity-0 pointer-fine:[.block-post:hover:not(:has(.block-comment:hover))_&]:opacity-100 pointer-fine:[.block-post:focus-within:not(:has(.block-comment:focus-within))_&]:opacity-100',
  comment:
    'pointer-fine:opacity-0 pointer-fine:[.block-comment:hover_&]:opacity-100 pointer-fine:[.block-comment:focus-within_&]:opacity-100',
  message:
    'pointer-fine:opacity-0 pointer-fine:[.block-message:hover_&]:opacity-100 pointer-fine:[.block-message:focus-within_&]:opacity-100',
}

/**
 * The ghost hover and current classes, shared by the nav items and list rows that are drawn like ghost buttons. The
 * hover is a 5% ink tint, not a solid grey, so on a tinted row (a hovered message) it darkens the row's colour
 * instead of drawing a grey square on it.
 */
export const GHOST_HOVER = 'hover:bg-ink/5 hover:text-ink'
export const GHOST_CURRENT = 'aria-[current=page]:bg-blush aria-[current=page]:text-sweet'

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'border border-sweet bg-sweet font-medium text-white hover:border-sweet-dark hover:bg-sweet-dark ' +
    'disabled:border-transparent disabled:bg-sweet/45 disabled:hover:bg-sweet/45',
  secondary:
    'border border-line bg-card text-ink hover:border-pink hover:text-sweet disabled:text-mute disabled:hover:border-line disabled:hover:text-mute',
  ghost:
    `border border-transparent bg-transparent text-mute ${GHOST_HOVER} aria-pressed:bg-blush aria-pressed:text-sweet ${GHOST_CURRENT} ` +
    'disabled:text-line disabled:hover:bg-transparent',
  danger:
    'border border-blush-line bg-card text-sweet hover:border-sweet hover:bg-blush ' +
    'disabled:border-line disabled:text-line disabled:hover:bg-card',
}

/**
 * The classes of a button, for the rare element that must look like a button but is not this component (a menu
 * trigger). A busy button drops its disabled styling, so it keeps its colour while it is disabled. `compact` is the
 * 26px icon-only size used by a message's menu.
 */
export function buttonClass(
  variant: NonNullable<ButtonProps['variant']>,
  iconOnly: boolean,
  busy = false,
  compact = false,
): string {
  const look = busy
    ? VARIANTS[variant]
        .split(' ')
        .filter((c) => !c.startsWith('disabled:'))
        .join(' ') + ' cursor-progress'
    : VARIANTS[variant]
  // A compact icon-only button is 26px, to fit inside a 28px chat message line.
  const pad = iconOnly ? (compact ? 'p-[3px]' : 'p-[7px]') : 'px-3 py-[5px]'
  return `${BASE} ${look} ${pad}`
}

export function Button({
  variant = 'primary',
  type = 'button',
  disabled,
  busy = false,
  compact = false,
  reveal,
  pressed,
  current,
  label,
  icon,
  count,
  onClick,
  onHoverChange,
  labels,
  children,
}: ButtonProps) {
  const iconOnly = icon !== undefined && children === undefined && !count
  // A button with no text uses the label as its accessible name, whether or not a count is shown.
  const wordless = children === undefined && label !== undefined
  // A button with no text shows its name in a tooltip.
  const tip = useTooltip(label ?? '', wordless)
  return (
    <>
      <button
        ref={tip.ref}
        className={`${buttonClass(variant, iconOnly, busy, compact)} ${reveal ? REVEAL[reveal] : ''}`}
        type={type}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        aria-pressed={pressed === undefined ? undefined : pressed}
        aria-current={current ? 'page' : undefined}
        aria-label={wordless ? label : undefined}
        {...tip.props({
          onMouseDown: pressed === undefined ? undefined : (e) => e.preventDefault(), // toggles keep editor focus
          onClick,
          onMouseEnter: onHoverChange && (() => onHoverChange(true)),
          onMouseLeave: onHoverChange && (() => onHoverChange(false)),
        })}
      >
        {busy ? (
          <span className="inline-flex flex-none animate-spin">
            <Icon name="spinner" />
          </span>
        ) : (
          icon && <Icon name={icon} />
        )}
        {count ? <span className="text-sm">{count}</span> : null}
        {labels && children !== undefined ? (
          // All the labels share one grid cell. The hidden ones only hold the width.
          <span className="inline-grid justify-items-start text-left">
            {labels.map((l) => (
              <span key={l} aria-hidden="true" className="invisible col-start-1 row-start-1">
                {l}
              </span>
            ))}
            <span className="col-start-1 row-start-1">{children}</span>
          </span>
        ) : (
          children
        )}
      </button>
      {tip.tooltip}
    </>
  )
}
