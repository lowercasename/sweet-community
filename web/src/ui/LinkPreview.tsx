import { Icon } from './Icon'

/** A link's preview: what the page gives in its OpenGraph tags, and the address of Sweet's copy of its picture. */
export interface LinkPreviewData {
  title: string
  description: string
  image: string | null
}

interface LinkPreviewProps {
  url: string
  /** Absent while the preview loads or when there is none to show. The card then shows `note` in place of the title. */
  preview?: LinkPreviewData
  note?: string
  /** In the editor the card does not open the page, and shows when it is selected. */
  inert?: boolean
  selected?: boolean
}

/** The page's domain, without www. The card shows it in place of a name the page gives itself, so it shows where the
 * link really goes. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const CARD =
  'link-preview group flex h-[100px] w-full overflow-hidden rounded-card border bg-card text-left text-ink no-underline ' +
  'hover:no-underline @max-[399px]:h-[76px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink'

/**
 * A link preview card, the shape of old Sweet's: the page's picture as a square on the left, then the title on one
 * line, the description on two (one when narrow), and the page's domain. It is 100px tall, and 76px when the card is narrower
 * than 400px, as on a phone. A page with no picture gets a grey square with a link icon, so every card has the same
 * shape. The whole card is one link that opens the page in a new tab. Its width is capped at 480px.
 */
export function LinkPreview({ url, preview, note, inert = false, selected = false }: LinkPreviewProps) {
  const border = selected ? 'border-pink' : inert ? 'border-line' : 'border-line hover:border-pink'
  const inner = (
    <>
      <span className="flex h-full w-[100px] flex-none items-center justify-center border-r border-line bg-field text-mute @max-[399px]:w-[76px]">
        {preview?.image ? (
          <img src={preview.image} alt="" loading="lazy" className="m-0 h-full w-full rounded-none object-cover" />
        ) : (
          <Icon name="link" size={22} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3.5 py-2.5 @max-[399px]:px-3 @max-[399px]:py-2">
        {preview ? (
          <span
            className={`truncate text-[15px] leading-5 font-medium text-ink ${inert ? '' : 'group-hover:text-sweet'}`}
          >
            {preview.title}
          </span>
        ) : (
          <span className="truncate text-[15px] leading-5 text-mute">{note}</span>
        )}
        {preview?.description && (
          <span className="line-clamp-2 text-sm leading-5 text-mute @max-[399px]:line-clamp-1">
            {preview.description}
          </span>
        )}
        <span className="truncate text-[11px] leading-[18px] text-mute uppercase">{hostOf(url)}</span>
      </span>
    </>
  )
  return (
    <span className="@container block max-w-[480px]">
      {inert ? (
        <span className={`${CARD} ${border}`}>{inner}</span>
      ) : (
        <a className={`${CARD} ${border}`} href={url} target="_blank" rel="noopener noreferrer nofollow">
          {inner}
        </a>
      )}
    </span>
  )
}
