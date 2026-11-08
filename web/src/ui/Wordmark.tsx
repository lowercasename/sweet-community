interface WordmarkProps {
  /** Show the label text next to the mark. When false, the mark alone has the label as its accessible name. */
  expanded?: boolean
  /** The label: the community's name, or other text such as "Made with Sweet". Defaults to "Sweet". */
  label?: string
  /** md: 32px mark and 18px bold label, used in the sidebar head. sm: 20px mark and 14px label, used for the credit under auth pages. */
  size?: 'sm' | 'md'
}

/**
 * Sweet's S in a red circle, with a label next to it. At both sizes the
 * letter's cap height is about two fifths of the circle's diameter, matching
 * the app icon. The gap is 8px, the same as the nav's, so in the sidebar the
 * label starts at the same x as the nav item labels. The label is red and
 * bold at md and grey at sm, so the credit under an auth page does not
 * compete with the page heading.
 */
const SIZES = {
  md: { box: 'h-8', mark: 'h-8 w-8 text-[19px]', words: 'text-[18px] font-bold text-sweet' },
  sm: { box: 'h-5', mark: 'h-5 w-5 text-[12px]', words: 'text-sm font-medium text-mute' },
}

export function Wordmark({ expanded = true, label, size = 'md' }: WordmarkProps) {
  const words = label || 'Sweet'
  const s = SIZES[size]
  return (
    <div className={`flex ${s.box} items-center gap-2`}>
      <span
        aria-hidden={expanded ? 'true' : undefined}
        role={expanded ? undefined : 'img'}
        aria-label={expanded ? undefined : words}
        className={`flex ${s.mark} flex-none items-center justify-center rounded-full bg-sweet font-bold leading-none text-white select-none`}
      >
        S
      </span>
      {expanded && (
        <span className={`truncate ${s.words}`} title={words}>
          {words}
        </span>
      )}
    </div>
  )
}
