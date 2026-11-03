import type { ReactNode } from 'react'

interface ButtonProps {
  /** `primary` is the pink pill; `quiet` is grey text; `tool` is a toolbar toggle. */
  variant?: 'primary' | 'quiet' | 'tool'
  type?: 'button' | 'submit'
  disabled?: boolean
  /** Toolbar toggles only: the mark is active at the cursor. */
  pressed?: boolean
  /** Accessible name when the label is a symbol (toolbar). */
  label?: string
  onClick?: () => void
  children?: ReactNode
}

const BASE =
  'm-0 cursor-pointer appearance-none font-sans text-[inherit] transition-colors duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink disabled:cursor-default'

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'rounded-[3px] border-0 bg-pink px-3 py-1 font-medium text-white shadow-button ' +
    'hover:bg-sweet hover:shadow-button-down active:shadow-button-down ' +
    'disabled:bg-line disabled:text-mute disabled:shadow-none',
  quiet: 'border-0 bg-transparent p-0 text-mute underline-offset-2 hover:text-sweet hover:underline disabled:text-line',
  tool:
    'min-w-7 rounded-[3px] border border-line bg-card px-1.5 py-0 text-sm leading-6 text-ink ' +
    'hover:border-pink hover:text-sweet aria-pressed:border-pink aria-pressed:bg-blush aria-pressed:text-sweet',
}

export function Button({ variant = 'primary', type = 'button', disabled, pressed, label, onClick, children }: ButtonProps) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]}`}
      type={type}
      disabled={disabled}
      aria-pressed={variant === 'tool' ? !!pressed : undefined}
      aria-label={label}
      title={label}
      onMouseDown={variant === 'tool' ? (e) => e.preventDefault() : undefined} // keep editor focus
      onClick={onClick}
    >
      {children}
    </button>
  )
}
