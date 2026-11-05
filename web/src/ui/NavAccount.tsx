import { Avatar } from './Avatar'
import { useTooltip } from './Tooltip'

interface NavAccountProps {
  username: string | null
  picture?: string | null
  expanded: boolean
}

/** The signed-in person, at the foot of the NavBar. */
export function NavAccount({ username, picture, expanded }: NavAccountProps) {
  const tip = useTooltip(username ?? '', !expanded && username !== null, 'right')
  if (!username) return null
  return (
    <>
      <div
        ref={tip.ref}
        className={`flex h-10 items-center gap-3 ${expanded ? 'px-1' : 'justify-center'}`}
        {...tip.props()}
      >
        <Avatar name={username} picture={picture} />
        {expanded && <span className="truncate text-ink">{username}</span>}
      </div>
      {tip.tooltip}
    </>
  )
}
