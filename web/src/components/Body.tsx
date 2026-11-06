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
 * A rendered body (architecture.md, Posts): the sanitised HTML with its
 * mentions named as their people are now and linked to their pages; those
 * anchors are routed in the app, so a tap on a name is a page change, not a
 * page load.
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
