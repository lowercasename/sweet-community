import type { ReactNode } from 'react'
import styles from './Button.module.css'

interface ButtonProps {
  variant?: 'primary' | 'quiet'
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  children?: ReactNode
}

/** Text button. `primary` has a 1px border; `quiet` is underlined text. */
export function Button({ variant = 'primary', type = 'button', disabled, onClick, children }: ButtonProps) {
  return (
    <button className={`${styles.button} ${styles[variant]}`} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
