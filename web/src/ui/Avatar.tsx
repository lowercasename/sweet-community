import donut from '../assets/donut.svg'

interface AvatarProps {
  /** The person's name, for assistive tech; the control around the picture names it to the eye. */
  name: string
  /** URL of their picture. Without one, they are a donut, as on old Sweet. */
  picture?: string | null
  size?: 'sm' | 'md' | 'lg'
  /** Hidden from assistive tech: the control it sits in says the name (a nav item's mark). */
  decorative?: boolean
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-14 w-14',
}

/** A round profile picture. The default is Sweet's donut, which matters. */
export function Avatar({ name, picture, size = 'md', decorative = false }: AvatarProps) {
  return (
    <img
      className={`${SIZES[size]} flex-none rounded-full object-cover select-none`}
      src={picture || donut}
      alt={decorative ? '' : name}
      aria-hidden={decorative || undefined}
      draggable={false}
    />
  )
}
