import type { ReactNode } from 'react'

interface CenteredProps {
  children?: ReactNode
}

/** A narrow column centred on the paper, for sign-in and join. */
export function Centered({ children }: CenteredProps) {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="w-full max-w-[380px]">{children}</div>
    </main>
  )
}
