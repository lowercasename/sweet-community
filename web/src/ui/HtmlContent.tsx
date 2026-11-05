import { useMemo } from 'react'
import { wrapGalleries } from '../content/galleries'

interface HtmlContentProps {
  /** HTML that has ALREADY been sanitised by the server (bluemonday). */
  html: string
  /** In a row: take the width left by its siblings and shrink below the content's own width (a wide picture). */
  fill?: boolean
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
export function HtmlContent({ html, fill = false }: HtmlContentProps) {
  const rendered = useMemo(() => wrapGalleries(html), [html])
  return <div className={fill ? 'content min-w-0 flex-1' : 'content'} dangerouslySetInnerHTML={{ __html: rendered }} />
}
