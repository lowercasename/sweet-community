import { Icon } from './Icon'
import { useTooltip } from './Tooltip'

/**
 * The words for the shield, in one place (architecture.md, Interface). A shield marks an area or an action that a
 * person has only because they are an owner or a moderator.
 */
export const shieldText = {
  /** An area that only the community's owner and moderators see. */
  staffSee: 'Only the owner and moderators see this',
  /** An area that only the community's owner sees. */
  ownerSees: 'Only the owner sees this',
  /** An action that only the community's owner and moderators have. */
  staffDo: 'Only the owner and moderators can do this',
  /** An action that only the community's owner has. */
  ownerDoes: 'Only the owner can do this',
  /** A Delete that a role allows. A room has its own owner and moderators, so the words are plural. */
  rolesDo: 'Only owners and moderators can do this',
}

interface ShieldMarkProps {
  /**
   * Who can see the area or do the action. The mark then shows it in a tooltip and screen readers read it. Without a
   * label the mark is decorative, because the control around it carries the words as its description.
   */
  label?: string
  size?: 14 | 16
  /** Inside a line of text, rather than as an item in a centred row. */
  inline?: boolean
}

/**
 * The grey shield that marks what only owners and moderators see or can do. In a centred row it is centred on the
 * text and moved down 1px, because its point is narrow and a centred shield looks high. Inside a line of text it is
 * placed below the baseline by the same rule. Raphael found it off the text's line on 2026-11-09.
 */
export function ShieldMark({ label, size = 16, inline = false }: ShieldMarkProps) {
  const tip = useTooltip(label ?? '', label !== undefined)
  const place = inline ? 'inline-block align-[-0.2em]' : 'inline-flex flex-none translate-y-px'
  if (label === undefined) {
    return (
      <span data-shield aria-hidden className={`${place} text-mute`}>
        <Icon name="shield" size={size} />
      </span>
    )
  }
  return (
    <>
      <span ref={tip.ref} data-shield role="img" aria-label={label} className={`${place} text-mute`} {...tip.props()}>
        <Icon name="shield" size={size} />
      </span>
      {tip.tooltip}
    </>
  )
}
