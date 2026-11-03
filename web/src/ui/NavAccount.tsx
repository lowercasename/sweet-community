import { Avatar } from './Avatar'

interface NavAccountProps {
  username: string | null
  expanded: boolean
}

/** The signed-in person, at the foot of the NavBar. */
export function NavAccount({ username, expanded }: NavAccountProps) {
  if (!username) return null
  return (
    <div
      className={`flex h-10 items-center gap-3 ${expanded ? 'px-1' : 'justify-center'}`}
      title={expanded ? undefined : username}
    >
      <Avatar name={username} />
      {expanded && <span className="truncate text-ink">{username}</span>}
    </div>
  )
}
