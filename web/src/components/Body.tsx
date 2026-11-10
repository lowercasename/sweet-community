import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useLocation } from 'wouter'
import { useLinkPreview, useUsers } from '../data/hooks'
import { decorate } from '../content/decorate'
import { HtmlContent, Lightbox, LinkPreview } from '../ui'

interface BodyProps {
  /** The server's sanitised HTML. */
  html: string
  size?: 'body' | 'small'
}

/** The body image an event happened on. prepareImages makes each body image that is not inside a link a button. */
const imageOf = (target: EventTarget) => (target as HTMLElement).closest?.<HTMLImageElement>('img[role="button"]')

/**
 * Renders a body. It shows the sanitised HTML, with
 * each mention showing the mentioned user's current name and linking to their
 * profile. The app's router handles those links, so tapping a name changes
 * the route without a full page load. A link preview in the body is drawn as
 * a card with the server's preview, or stays a plain link when there is none.
 * An image opens alone, full screen, on a click or on Enter.
 */
export function Body({ html, size }: BodyProps) {
  const { data: users } = useUsers()
  const [, navigate] = useLocation()
  const names = useMemo(() => new Map([...(users?.values() ?? [])].map((u) => [u.id, u.username])), [users])
  const decorated = useMemo(() => decorate(html, { names }), [html, names])
  const [shown, setShown] = useState<{ src: string; alt: string } | null>(null)
  // The image that opened the lightbox takes focus again when it closes.
  const opener = useRef<HTMLImageElement | null>(null)
  const openImage = (img: HTMLImageElement) => {
    opener.current = img
    setShown({ src: img.getAttribute('src') ?? '', alt: img.alt })
  }
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const img = imageOf(e.target)
    if (img) {
      openImage(img)
      return
    }
    const a = (e.target as HTMLElement).closest('a[data-mention-id]')
    if (!a || e.metaKey || e.ctrlKey || e.button !== 0) return
    e.preventDefault()
    navigate(a.getAttribute('href') ?? '/')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const img = imageOf(e.target)
    if (!img || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    openImage(img)
  }
  return (
    <>
      <HtmlContent html={decorated} size={size} onClick={onClick} onKeyDown={onKeyDown} embed={drawCard} />
      <Lightbox
        image={shown}
        onClose={() => setShown(null)}
        onClosed={() => opener.current?.focus({ preventScroll: true })}
      />
    </>
  )
}

function drawCard(url: string) {
  return <BodyCard url={url} />
}

/** A link preview card in a body. Nothing is drawn while the preview loads or when the page gives none. */
function BodyCard({ url }: { url: string }) {
  const { data } = useLinkPreview(url)
  if (!data) return null
  return <LinkPreview url={url} preview={{ title: data.title, description: data.description, image: data.image }} />
}
