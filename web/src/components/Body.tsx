import { useMemo, type MouseEvent } from 'react'
import { useLocation } from 'wouter'
import { useUsers } from '../data/hooks'
import { decorate } from '../content/decorate'
import { HtmlContent } from '../ui'

interface BodyProps {
  /** The server's sanitised HTML. */
  html: string
  size?: 'body' | 'small'
}

/**
 * Renders a body. It shows the sanitised HTML, with
 * each mention showing the mentioned user's current name and linking to their
 * profile. The app's router handles those links, so tapping a name changes
 * the route without a full page load.
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
  return <HtmlContent html={decorated} size={size} onClick={onClick} />
}
