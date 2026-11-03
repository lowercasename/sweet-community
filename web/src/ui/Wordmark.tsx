interface WordmarkProps {
  /** Show the name beside the mark. */
  expanded: boolean
}

/** Sweet's mark: an S in a red circle, with the name beside it when there is room. */
export function Wordmark({ expanded }: WordmarkProps) {
  return (
    <div className="flex h-8 items-center gap-3">
      <span
        aria-hidden={expanded ? 'true' : undefined}
        role={expanded ? undefined : 'img'}
        aria-label={expanded ? undefined : 'Sweet'}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-sweet text-[17px] font-bold leading-none text-white select-none"
      >
        S
      </span>
      {expanded && <span className="text-[18px] font-bold text-sweet">Sweet</span>}
    </div>
  )
}
