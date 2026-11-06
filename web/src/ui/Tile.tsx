interface TileProps {
  /** The place's name; its first letter is shown when it has no picture. */
  name: string
  /** The place's picture, when it has one. */
  picture?: string | null
  /** `lg` on the room's own settings, beside the control that sets it. */
  size?: 'sm' | 'lg'
}

/**
 * A place's mark: a small square carrying its picture, or its initial. Line
 * icons mean features, tiles and faces mean places and people, so a group in
 * the nav never looks like a page. Decorative; the label beside it names the place.
 */
export function Tile({ name, picture, size = 'sm' }: TileProps) {
  const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? '?'
  const box = size === 'lg' ? 'h-14 w-14 rounded-[10px] text-xl' : 'h-6 w-6 rounded-[6px] text-xs'
  if (picture) {
    return (
      <img
        aria-hidden="true"
        className={`${box} flex-none border border-line object-cover select-none`}
        src={picture}
        alt=""
        draggable={false}
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
