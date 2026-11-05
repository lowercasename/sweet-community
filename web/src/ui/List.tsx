import type { ReactNode } from 'react'

interface ListProps {
  gap?: 1 | 2 | 3
  children?: ReactNode
}

const GAPS = { 1: 'gap-1', 2: 'gap-2', 3: 'gap-3' }

/** A plain list of things, one per row. Semantics for assistive tech, no bullets. */
export function List({ gap = 2, children }: ListProps) {
  return <ul className={`m-0 flex list-none flex-col p-0 ${GAPS[gap]}`}>{children}</ul>
}

/** One row. A container, so a Row inside may wrap only when the row itself is narrow. */
export function ListItem({ children }: { children?: ReactNode }) {
  return <li className="m-0 p-0 @container">{children}</li>
}
