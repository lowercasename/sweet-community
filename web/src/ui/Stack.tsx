import type { ReactNode } from 'react'

export type Gap = 0 | 1 | 2 | 3 | 4

const GAPS: Record<Gap, string> = { 0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-4', 4: 'gap-8' }

interface StackProps {
  gap?: Gap
  as?: 'div' | 'section' | 'main' | 'ul'
  children?: ReactNode
}

/** Vertical flex column with a fixed gap scale: 0, 4, 8, 16, 32px. */
export function Stack({ gap = 2, as = 'div', children }: StackProps) {
  const Tag = as
  return <Tag className={`flex min-w-0 flex-col ${GAPS[gap]}`}>{children}</Tag>
}
