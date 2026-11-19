import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * A link's preview: what the page gives in its OpenGraph tags, the address of Sweet's copy of its picture, and the
 * page's player for its video or audio, if it gives one.
 */
export interface LinkPreviewData {
  title: string
  description: string
  image: string | null
  player?: { url: string; width: number; height: number } | null
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
  'link-preview flex h-[100px] w-full overflow-hidden rounded-card border bg-card text-left text-ink no-underline ' +
  'hover:no-underline @max-[399px]:h-[76px]'

/** The focus ring of a card that is a link or a button. */
const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink'

const PICTURE =
  'relative flex h-full w-[191px] flex-none items-center justify-center border-r border-line bg-field text-mute ' +
  '@max-[399px]:w-[145px]'

const TEXT = 'flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3.5 py-2.5 @max-[399px]:px-3 @max-[399px]:py-2'

/** A picture narrower than this, width over height, is shown whole on the grey, not cropped. Logos are near square. */
const SQUARE_ENOUGH = 1.3

/**
 * What a player's frame may do. It may not navigate Sweet's page, open dialogs or submit forms. Its scripts can still
 * send what a reader types into it to its own site.
 */
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation'

/**
 * The player's address with autoplay=1 added to its query, so that the click that loads the player also starts it on
 * the sites that read it. The rest of the query is left as the page gave it.
 */
function autoplay(url: string): string {
  try {
    const u = new URL(url)
    u.search += (u.search ? '&' : '?') + 'autoplay=1'
    return u.toString()
  } catch {
    return url
  }
}

/**
 * A link preview card, the shape of old Sweet's: the page's picture on the left, then the title on one line, the
 * description on two (one when narrow), and the page's domain. It is 100px tall, and 76px when the card is narrower
 * than 400px, as on a phone. The picture area is 1.91 times as wide as it is tall (191 by 100, or 145 by 76), the
 * shape of the 1200 by 630 pictures that most pages give, so their pictures show whole. A picture
 * close to square, such as a logo, is shown whole and centred on grey. A page with no picture gets the grey area with
 * a link icon, so every card has the same shape. Its width is its column's, up to the 680px reading width, so the
 * description has room.
 *
 * A card with no player is one link that opens the page in a new tab. A page that gives a player has a play mark on
 * its picture, and its whole card is one button. Pressing it replaces the card with the player's frame, in the shape
 * the page gives and between 100px and 480px tall, with the page's domain as a link under it. That link opens the
 * page. The frame takes the keyboard focus. Nothing is requested from the page's site before that.
 */
export function LinkPreview({ url, preview, note, inert = false, selected = false }: LinkPreviewProps) {
  const border = selected ? 'border-pink' : inert ? 'border-line' : 'border-line hover:border-pink'
  const [squarish, setSquarish] = useState(false)
  const [playing, setPlaying] = useState(false)
  const player = preview?.player
  const frame = useRef<HTMLIFrameElement>(null)
  // The play button is removed when the player loads, so the focus it had moves to the frame.
  useEffect(() => {
    if (playing) frame.current?.focus()
  }, [playing])
  if (preview && player && playing) {
    return (
      // The link-preview class hides the body's plain link, as it does while the card is shown.
      <span className="link-preview block max-w-reading">
        <iframe
          ref={frame}
          src={autoplay(player.url)}
          title={preview.title}
          sandbox={SANDBOX}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          // Sweet's pages send no referrer to other sites. Some players refuse to play without the embedding
          // site's origin, so the frame sends the origin and no path.
          referrerPolicy="strict-origin"
          style={{ aspectRatio: `${player.width} / ${player.height}` }}
          className="m-0 block max-h-[480px] min-h-[100px] w-full rounded-card border border-line bg-field"
        />
        <a
          className="mt-1 block truncate text-[11px] leading-[18px] text-mute uppercase no-underline hover:text-sweet hover:underline"
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {hostOf(url)}
        </a>
      </span>
    )
  }
  const picture = (
    <>
      {preview?.image ? (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          onLoad={(e) => setSquarish(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight < SQUARE_ENOUGH)}
          className={`m-0 h-full w-full rounded-none ${squarish ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        !player && <Icon name="link" size={22} />
      )}
      {player && (
        <span className="absolute top-1/2 left-1/2 flex size-10 -translate-1/2 items-center justify-center rounded-full bg-black/65 pl-0.5 text-white @max-[399px]:size-8">
          <Icon name="play" size={18} />
        </span>
      )}
    </>
  )
  const text = (
    <>
      {preview ? (
        <span
          className={`truncate text-[15px] leading-5 font-medium text-ink ${inert ? '' : 'group-hover/link:text-sweet'}`}
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
    </>
  )
  const link = { href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }
  return (
    <span className="@container block max-w-reading">
      {inert ? (
        <span className={`${CARD} ${border}`}>
          <span className={PICTURE}>{picture}</span>
          <span className={TEXT}>{text}</span>
        </span>
      ) : preview && player ? (
        <button
          type="button"
          aria-label={`Play ${preview.title}`}
          className={`${CARD} ${RING} ${border} group/link cursor-pointer appearance-none p-0 font-[inherit]`}
          onClick={() => setPlaying(true)}
        >
          <span className={PICTURE}>{picture}</span>
          <span className={TEXT}>{text}</span>
        </button>
      ) : (
        <a className={`${CARD} ${RING} ${border} group/link`} {...link}>
          <span className={PICTURE}>{picture}</span>
          <span className={TEXT}>{text}</span>
        </a>
      )}
    </span>
  )
}
