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
}

/** The grey shield that marks what only owners and moderators see or can do. */
export function ShieldMark({ label, size = 16 }: ShieldMarkProps) {
  const tip = useTooltip(label ?? '', label !== undefined)
  if (label === undefined) {
    return (
      <span data-shield aria-hidden className="inline-flex flex-none text-mute">
        <Icon name="shield" size={size} />
      </span>
    )
  }
  return (
    <>
      <span
        ref={tip.ref}
        data-shield
        role="img"
        aria-label={label}
        className="inline-flex flex-none text-mute"
        {...tip.props()}
      >
        <Icon name="shield" size={size} />
      </span>
      {tip.tooltip}
    </>
  )
}
