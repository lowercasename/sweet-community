import type { ReactNode } from 'react'

interface TextProps {
  as?: 'p' | 'span'
  /** `name` is for an author name. Sweet red, medium weight. */
  variant?: 'body' | 'secondary' | 'small' | 'name'
  weight?: 'normal' | 'bold'
  children?: ReactNode
}

const VARIANTS: Record<NonNullable<TextProps['variant']>, string> = {
  body: 'text-ink',
  secondary: 'text-mute',
  small: 'text-mute text-sm',
  name: 'text-sweet font-medium',
}

/** Running text. */
export function Text({ as = 'p', variant = 'body', weight = 'normal', children }: TextProps) {
  const cls = `m-0 [overflow-wrap:anywhere] ${VARIANTS[variant]} ${weight === 'bold' ? 'font-medium' : ''}`
  return as === 'span' ? <span className={cls}>{children}</span> : <p className={cls}>{children}</p>
}
