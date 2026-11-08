interface WordmarkProps {
  /** Show the words beside the mark; the mark alone carries them as its name. */
  expanded?: boolean
  /** The words: the community's name, or what the mark is saying. Sweet until there is a name. */
  label?: string
  /**
   * md is the community's own: the sidebar's head. sm is the product's
   * credit under a stranger's page ("Made with Sweet").
   */
  size?: 'sm' | 'md'
}

/**
 * Sweet's S in a red circle with words beside it. The letter fills the
 * circle as it does on the icon (the cap two fifths of the diameter), so the
 * mark is one shape at every size, and the gap is the nav's, so in the
 * sidebar the name sits on the nav labels' line. The mark carries the red;
 * the credit's words are quiet, so a stranger's page has one loud thing,
 * the community's name.
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
