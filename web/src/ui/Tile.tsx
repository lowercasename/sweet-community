interface TileProps {
  /** The place's name; its first letter is shown. */
  name: string
}

/**
 * A place's mark: a small square carrying its initial. Line icons mean
 * features, tiles and faces mean places and people, so a group in the nav
 * never looks like a page. Decorative; the label beside it names the place.
 */
export function Tile({ name }: TileProps) {
  const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? '?'
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 flex-none items-center justify-center rounded-[6px] border border-line bg-field text-xs font-bold text-ink select-none"
    >
      {initial}
    </span>
  )
}
