interface CountProps {
  /** How many; nothing is drawn for 0. */
  n: number
}

/**
 * A small pill with a number, for unread messages on a room (architecture.md,
 * Notifications). Decorative: the control carrying it says the number in its name.
 */
export function Count({ n }: CountProps) {
  if (n <= 0) return null
  return (
    <span
      aria-hidden
      className="ml-auto flex-none rounded-full bg-sweet px-1.5 text-[11px] leading-4 font-semibold text-white"
    >
      {n}
    </span>
  )
}
