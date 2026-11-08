import donut from '../assets/donut.svg'

interface AvatarProps {
  /** The user's name, as the alt text. The control around the picture shows the name visually. */
  name: string
  /** URL of the user's picture. Without one, the donut is shown, as on old Sweet. */
  picture?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Hide from assistive tech. For when the control around it already has the name, such as a nav item's mark. */
  decorative?: boolean
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-5 w-5',
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-14 w-14',
}

/** A round profile picture. The default is Sweet's donut, which is part of Sweet's identity. */
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
