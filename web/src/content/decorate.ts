/**
 * Mentions are resolved at render time (architecture.md, Posts). A stored
 * mention is <span data-mention-id="uuid">@name</span>, and the name shown is
 * the user's current name, so a rename breaks nothing. Each mention becomes
 * an anchor to the user's profile page, which Body routes without a page
 * load. The input is the server's sanitised HTML, and the output adds only
 * anchors with app paths, so the one raw HTML sink (HtmlContent) stays safe.
 * Hashtags are plain text until the decision between tags and topics is made.
 */
export interface Decoration {
  /** Current usernames by id. A mention of an unknown id keeps its stored name. */
  names?: Map<string, string>
}

export const profileHref = (name: string) => `/u/${encodeURIComponent(name)}`

/** Turns each mention into a link to the user's profile page, showing their current name. */
export function decorate(html: string, { names }: Decoration = {}): string {
  if (!html.includes('data-mention-id')) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const span of Array.from(doc.querySelectorAll('span[data-mention-id]'))) {
    const id = span.getAttribute('data-mention-id') ?? ''
    const name = names?.get(id) ?? span.textContent?.replace(/^@/, '') ?? ''
    const a = doc.createElement('a')
    a.setAttribute('href', profileHref(name))
    a.setAttribute('data-mention-id', id)
    a.textContent = `@${name}`
    span.replaceWith(a)
  }
  return doc.body.innerHTML
}
