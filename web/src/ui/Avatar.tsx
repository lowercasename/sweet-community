interface AvatarProps {
  /** The person's name; the first letter is shown until there are pictures. */
  name: string
}

/** A round initial, grey until profile pictures exist. */
export function Avatar({ name }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-field text-sm font-medium text-ink uppercase select-none"
    >
      {name.charAt(0)}
    </span>
  )
}
