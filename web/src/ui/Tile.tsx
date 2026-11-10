interface TileProps {
  /** The group's name. Its first letter is shown when the group has no picture. */
  name: string
  /** The group's picture, if it has one. */
  picture?: string | null
  /** `md` matches the size of a user's avatar. Used on the room's settings page beside the control that sets the picture. */
  size?: 'sm' | 'md'
}

/**
 * A group's mark. A small square showing its picture, or its initial when it
 * has none. Line icons mean features, and tiles and avatars mean groups and
 * people, so a group in the nav never looks like a page. Decorative. The label
 * beside it names the group.
 */
export function Tile({ name, picture, size = 'sm' }: TileProps) {
  const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? '?'
  const box = size === 'md' ? 'h-8 w-8 rounded-[8px] text-sm' : 'h-6 w-6 rounded-[6px] text-xs'
  if (picture) {
    return (
      <img
        aria-hidden="true"
        className={`${box} flex-none border border-line object-cover select-none`}
        src={picture}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} flex flex-none items-center justify-center border border-line bg-field font-bold text-ink select-none`}
    >
      {initial}
    </span>
  )
}
