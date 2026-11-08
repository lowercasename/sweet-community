import { Button } from './Button'
import { Icon } from './Icon'
import { Textarea } from './Textarea'

/** Maximum alt text length. Mastodon allows 1500, Bluesky 2000, X 1000. */
export const ALT_MAX = 1500

const PLACEHOLDER = 'Describe this image for people using screen readers.'

const CORNERS = {
  all: 'rounded-[4px]',
  top: 'rounded-t-[4px]',
  bottom: 'rounded-b-[4px]',
  none: '',
}

interface ImageCardProps {
  src: string
  alt: string
  onAltChange: (alt: string) => void
  /** Called when Enter is pressed in the alt text field. */
  onAltEnter?: () => void
  onRemove?: () => void
  /** Show a drag grip with TipTap's data-drag-handle attribute. For cards that are editor nodes. */
  grip?: boolean
  /** Which corners are rounded. Adjacent cards join into one block, so only the outer corners are rounded. */
  corners?: keyof typeof CORNERS
  selected?: boolean
}

/**
 * An image with its alt text being edited. The picture is small on the left
 * and the alt text field takes the rest of the width. Used for image nodes in
 * the post editor and for the images attached to a chat message.
 */
export function ImageCard({
  src,
  alt,
  onAltChange,
  onAltEnter,
  onRemove,
  grip,
  corners = 'all',
  selected,
}: ImageCardProps) {
  const ring = selected ? 'outline-2 outline-offset-2 outline-pink' : ''
  return (
    <div className={`flex items-stretch gap-2 border border-line bg-field p-2 ${CORNERS[corners]} ${ring}`}>
      {grip && (
        <span
          className="flex cursor-grab items-center text-mute hover:text-ink"
          title="Drag to move"
          data-drag-handle
          contentEditable={false}
        >
          <Icon name="grip" />
        </span>
      )}
      <img className="m-0 h-20 w-20 shrink-0 rounded-[4px] object-cover" src={src} alt={alt} draggable={false} />
      <span className="min-w-0 flex-1">
        <Textarea
          value={alt}
          onChange={onAltChange}
          placeholder={PLACEHOLDER}
          maxLength={ALT_MAX}
          rows={3}
          onSubmit={onAltEnter}
        />
      </span>
      {onRemove && (
        <span className="self-start">
          <Button variant="ghost" icon="remove" label="Remove image" onClick={onRemove} />
        </span>
      )}
    </div>
  )
}
