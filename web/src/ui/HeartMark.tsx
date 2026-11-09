import { Icon } from './Icon'

/** A small red heart inside a line of text, read as "love". It sits on the text's line, like an inline shield. */
export function HeartMark() {
  return (
    <span role="img" aria-label="love" className="inline-block align-[-0.15em] text-sweet">
      <Icon name="heart" size={14} />
    </span>
  )
}
