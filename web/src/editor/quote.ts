const QUOTE_MAX = 240

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The HTML a quote-reply inserts: the current selection if there is one,
 * else the given text, shortened, as a blockquote followed by an empty
 * paragraph to type in. Goes through the server's sanitiser like any body.
 */
export function quoteHtml(fallback: string): string {
  const sel = window.getSelection()?.toString().trim() ?? ''
  const text = sel || fallback
  const short = text.length > QUOTE_MAX ? text.slice(0, QUOTE_MAX).trimEnd() + '…' : text
  return `<blockquote><p>${escapeHtml(short)}</p></blockquote><p></p>`
}
