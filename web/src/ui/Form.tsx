import type { FormEvent, ReactNode } from 'react'

interface FormProps {
  onSubmit: () => void
  children?: ReactNode
}

/** A form element. It always prevents the native submit. */
export function Form({ onSubmit, children }: FormProps) {
  const handle = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <form className="m-0 flex flex-col gap-2" onSubmit={handle}>
      {children}
    </form>
  )
}
