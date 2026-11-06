import { useMemo, type MouseEvent } from 'react'
import { wrapGalleries } from '../content/galleries'

interface HtmlContentProps {
  /** HTML that has ALREADY been sanitised by the server (bluemonday). */
  html: string
  /** `small` is a comment: a size under the post it answers. */
  size?: 'body' | 'small'
  /** A click anywhere in the body: Body routes the anchors it made (mentions) without a page load. */
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
}

/**
 * Renders server-sanitised HTML with the .content styles from global.css.
 * Runs of adjacent images are wrapped as galleries at render time.
 *
 * This is the ONE component in the codebase allowed to use dangerouslySetInnerHTML.
 * It is safe only because every body passes through the server's bluemonday policy
 * before storage; nothing client-generated may be passed here unsanitised.
 * `pnpm check:atomic` fails if dangerouslySetInnerHTML appears anywhere else.
 */
export function HtmlContent({ html, size = 'body', onClick }: HtmlContentProps) {
  const rendered = useMemo(() => wrapGalleries(html), [html])
  return (
    <div
      className={size === 'small' ? 'content text-[15px]' : 'content'}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  )
}
