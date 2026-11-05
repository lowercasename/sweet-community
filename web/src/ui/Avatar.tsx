import donut from '../assets/donut.svg'

interface AvatarProps {
  /** The person's name, for assistive tech and the tooltip. */
  name: string
  /** URL of their picture. Without one, they are a donut, as on old Sweet. */
  picture?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-14 w-14',
}

/** A round profile picture. The default is Sweet's donut, which matters. */
export function Avatar({ name, picture, size = 'md' }: AvatarProps) {
  return (
    <img
      className={`${SIZES[size]} flex-none rounded-full object-cover select-none`}
      src={picture || donut}
      alt={name}
      title={name}
      draggable={false}
    />
  )
}
