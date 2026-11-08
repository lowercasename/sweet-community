import type { ReactNode } from 'react'

/** A line of centred grey text between the messages of a chat, for someone joining or being added. */
export function ChatNote({ children }: { children?: ReactNode }) {
  return <p className="m-0 py-0.5 text-center text-sm text-mute">{children}</p>
}
