interface WordmarkProps {
  /** Show the name beside the mark. */
  expanded: boolean
  /** The community's name; the mark alone says Sweet until it has one. */
  name?: string
}

/**
 * The community's mark: Sweet's S in a red circle, with the community's
 * name beside it when there is room (Raphael, 2026-11-06: the name replaces
 * "Sweet"; the mark is the product's, kept small).
 */
export function Wordmark({ expanded, name }: WordmarkProps) {
  const label = name || 'Sweet'
  return (
    <div className="flex h-8 items-center gap-3">
      <span
        aria-hidden={expanded ? 'true' : undefined}
        role={expanded ? undefined : 'img'}
        aria-label={expanded ? undefined : label}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-sweet text-[17px] font-bold leading-none text-white select-none"
      >
        S
      </span>
      {expanded && <span className="truncate text-[18px] font-bold text-sweet">{label}</span>}
    </div>
  )
}
