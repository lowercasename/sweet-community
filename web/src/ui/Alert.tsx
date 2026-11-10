import type { ReactNode } from 'react'

interface AlertProps {
  /** `notice` is low-key information. `warning` is a limitation. `error` is a failure. */
  tone?: 'notice' | 'warning' | 'error'
  children?: ReactNode
}

const TONES: Record<NonNullable<AlertProps['tone']>, string> = {
  notice: 'border-line bg-field text-mute',
  warning: 'border-blush-line bg-blush text-ink',
  error: 'border-blush-line bg-blush text-sweet',
}

/**
 * A notice set apart from the content around it. A short strip with its own
 * background, for information, a limitation or a failure. All three use
 * one shape, so a notice is always distinguishable from the content it is about.
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
