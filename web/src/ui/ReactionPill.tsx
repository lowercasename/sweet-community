import { useRef } from 'react'
import { buttonClass } from './Button'
import { HOLD } from './ItemBlock'
import { useTooltip } from './Tooltip'

interface ReactionPillProps {
  emoji: string
  count: number
  /** Whether the viewer chose this emoji. The pill is then pressed. */
  mine: boolean
  /** Who chose the emoji, such as "You and kit reacted with 👍". It is the pill's name and its tooltip. */
  label: string
  disabled?: boolean
  onToggle: () => void
}

/**
 * One emoji under a post, comment or message, with the number of people who chose it. It is a toggle drawn as a
 * compact ghost button, pressed when the viewer chose the emoji. Hovering or focusing it shows who chose the emoji. On
 * a touch screen, pressing and holding it shows the same, and that press does not toggle it.
 */
export function ReactionPill({ emoji, count, mine, label, disabled, onToggle }: ReactionPillProps) {
  const tip = useTooltip(label, true, 'top', true)
  const timer = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const release = () => window.clearTimeout(timer.current)
  return (
    <>
      <button
        ref={tip.ref}
        type="button"
        className={`${buttonClass('ghost', false, false, true)} select-none [-webkit-touch-callout:none]`}
        aria-pressed={mine}
        aria-label={label}
        disabled={disabled}
        {...tip.props({
          onClick: () => {
            if (held.current) held.current = false
            else onToggle()
          },
          onTouchStart: () => {
            held.current = false
            timer.current = window.setTimeout(() => {
              held.current = true
              tip.show()
            }, HOLD)
          },
          onTouchEnd: release,
          onTouchMove: release,
          onContextMenu: (e) => e.preventDefault(),
        })}
      >
        <span aria-hidden="true">{emoji}</span>
        <span aria-hidden="true" className="text-sm">
          {count}
        </span>
      </button>
      {tip.tooltip}
    </>
  )
}
