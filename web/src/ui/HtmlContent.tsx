interface HtmlContentProps {
  /** HTML that has ALREADY been sanitised by the server (bluemonday). */
  html: string
}

/**
 * Renders server-sanitised HTML with the .content styles from global.css.
 *
 * This is the ONE component in the codebase allowed to use dangerouslySetInnerHTML.
 * It is safe only because every body passes through the server's bluemonday policy
 * before storage; nothing client-generated may be passed here unsanitised.
 * `pnpm check:atomic` fails if dangerouslySetInnerHTML appears anywhere else.
 */
export function HtmlContent({ html }: HtmlContentProps) {
  return <div className="content" dangerouslySetInnerHTML={{ __html: html }} />
}
