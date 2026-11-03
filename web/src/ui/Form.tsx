import type { FormEvent, ReactNode } from 'react'
import styles from './Form.module.css'

interface FormProps {
  onSubmit: () => void
  children?: ReactNode
}

/** Form element; always prevents the native submit. */
export function Form({ onSubmit, children }: FormProps) {
  const handle = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <form className={styles.form} onSubmit={handle}>
      {children}
    </form>
  )
}
