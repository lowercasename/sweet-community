import type { ReactNode } from 'react'

interface AlertProps {
  /** `notice` is quiet news (connecting); `warning` is a limit (offline); `error` is something that failed. */
  tone?: 'notice' | 'warning' | 'error'
  children?: ReactNode
}

const TONES: Record<NonNullable<AlertProps['tone']>, string> = {
  notice: 'border-line bg-field text-mute',
  warning: 'border-blush-line bg-blush text-ink',
  error: 'border-blush-line bg-blush text-sweet',
}

/**
 * A notice set apart from the content around it: a short strip with its own
 * ground, for a connection's state, a limit or a failure. One shape for all
 * of them, so a notice is always told from the thing it is about.
 */
export function Alert({ tone = 'notice', children }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-[4px] border px-3 py-1.5 text-sm ${TONES[tone]}`}
    >
      {children}
    </div>
  )
}
