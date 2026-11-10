import { useMemo, type MouseEvent } from 'react'
import { useLocation } from 'wouter'
import { useLinkPreview, useUsers } from '../data/hooks'
import { decorate } from '../content/decorate'
import { HtmlContent, LinkPreview } from '../ui'

interface BodyProps {
  /** The server's sanitised HTML. */
  html: string
  size?: 'body' | 'small'
}

/**
 * Renders a body. It shows the sanitised HTML, with
 * each mention showing the mentioned user's current name and linking to their
 * profile. The app's router handles those links, so tapping a name changes
 * the route without a full page load. A link preview in the body is drawn as
 * a card with the server's preview, or stays a plain link when there is none.
 */
export function Body({ html, size }: BodyProps) {
  const { data: users } = useUsers()
  const [, navigate] = useLocation()
  const names = useMemo(() => new Map([...(users?.values() ?? [])].map((u) => [u.id, u.username])), [users])
  const decorated = useMemo(() => decorate(html, { names }), [html, names])
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a[data-mention-id]')
    if (!a || e.metaKey || e.ctrlKey || e.button !== 0) return
    e.preventDefault()
    navigate(a.getAttribute('href') ?? '/')
  }
  return <HtmlContent html={decorated} size={size} onClick={onClick} embed={drawCard} />
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
