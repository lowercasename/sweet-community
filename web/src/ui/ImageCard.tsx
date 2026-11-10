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
  /**
   * An image being uploaded. While `progress` is a number (the fraction sent), the card shows the upload in place of
   * the alt text field. When `failed` is a string, it shows that the upload failed, the reason if there is one, and
   * Try again.
   */
  upload?: { progress: number | null; failed: string | null; onRetry: () => void }
}

/**
 * An image with its alt text being edited. The picture is small on the left
 * and the alt text field takes the rest of the width. Used for image nodes in
 * the post editor and for the images attached to a chat message. The picture
 * shows as soon as the image is chosen. Until its upload has finished, the
 * upload or its failure takes the place of the alt text field.
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
  upload,
}: ImageCardProps) {
  const ring = selected ? 'outline-2 outline-offset-2 outline-pink' : ''
  return (
    <div className={`image-card flex items-stretch gap-2 border border-line bg-field p-2 ${CORNERS[corners]} ${ring}`}>
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
        {upload?.failed != null ? (
          <span className="flex h-full flex-col items-start justify-center gap-2">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-sweet">Failed to upload</span>
              {upload.failed && <span className="text-sm text-mute">{upload.failed}</span>}
            </span>
            <Button variant="secondary" onClick={upload.onRetry}>
              Try again
            </Button>
          </span>
        ) : upload?.progress != null ? (
          <span className="flex h-full flex-col justify-center gap-2">
            <span className="text-sm text-mute">Uploading… {Math.round(upload.progress * 100)}%</span>
            <span
              role="progressbar"
              aria-label="Upload"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(upload.progress * 100)}
              className="block h-1.5 w-full overflow-hidden rounded-full bg-line"
            >
              <span
                className="block h-full rounded-full bg-sweet transition-[width] duration-200"
                style={{ width: `${Math.round(upload.progress * 100)}%` }}
              />
            </span>
          </span>
        ) : (
          <Textarea
            value={alt}
            onChange={onAltChange}
            placeholder={PLACEHOLDER}
            maxLength={ALT_MAX}
            rows={3}
            onSubmit={onAltEnter}
          />
        )}
      </span>
      {onRemove && (
        <span className="self-start">
          <Button variant="ghost" icon="remove" label="Remove image" onClick={onRemove} />
        </span>
      )}
    </div>
  )
}
