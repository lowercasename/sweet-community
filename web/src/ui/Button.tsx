import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface ButtonProps {
  /** `primary` is filled pink; `secondary` is outlined; `ghost` is bare text or an icon. */
  variant?: 'primary' | 'secondary' | 'ghost'
  type?: 'button' | 'submit'
  disabled?: boolean
  /** Toggles: the state is on (aria-pressed). */
  pressed?: boolean
  /** Accessible name; required when the button has no text. */
  label?: string
  icon?: IconName
  /** A small number after the icon, as old Sweet's post toolbar showed comment counts. Hidden when 0. */
  count?: number
  onClick?: () => void
  children?: ReactNode
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-[4px] font-sans text-[inherit] leading-6 ' +
  'cursor-pointer appearance-none transition-colors duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink disabled:cursor-default'

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'border border-pink bg-pink font-medium text-white hover:border-sweet hover:bg-sweet disabled:border-line disabled:bg-line disabled:text-mute',
  secondary:
    'border border-line bg-card text-ink hover:border-pink hover:text-sweet disabled:text-mute disabled:hover:border-line',
  ghost:
    'border border-transparent bg-transparent text-mute hover:bg-field hover:text-ink ' +
    'aria-pressed:bg-blush aria-pressed:text-sweet disabled:text-line disabled:hover:bg-transparent',
}

/** The classes of a button, for the rare element that must be a button but not this component (a menu trigger). */
export function buttonClass(variant: NonNullable<ButtonProps['variant']>, iconOnly: boolean): string {
  return `${BASE} ${VARIANTS[variant]} ${iconOnly ? 'p-1.5' : 'px-3 py-1'}`
}

export function Button({
  variant = 'primary',
  type = 'button',
  disabled,
  pressed,
  label,
  icon,
  count,
  onClick,
  children,
}: ButtonProps) {
  const iconOnly = icon !== undefined && children === undefined && !count
  // No words of its own: the label is its name, whether or not a count shows.
  const wordless = children === undefined && label !== undefined
  return (
    <button
      className={buttonClass(variant, iconOnly)}
      type={type}
      disabled={disabled}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-label={wordless ? label : undefined}
      title={label}
      onMouseDown={pressed === undefined ? undefined : (e) => e.preventDefault()} // toggles keep editor focus
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      {count ? <span className="text-sm">{count}</span> : null}
      {children}
    </button>
  )
}
