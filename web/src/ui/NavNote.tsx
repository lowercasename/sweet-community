import type { ReactNode } from 'react'

/** A line of small grey text at the foot of the nav, inset like a section's title. It names the release. */
export function NavNote({ children }: { children?: ReactNode }) {
  return <p className="m-0 px-3 pt-1 text-xs text-mute">{children}</p>
}
