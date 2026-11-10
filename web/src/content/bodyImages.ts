/**
 * Prepares the images of a sanitised body for display. Each loads only when it comes near the screen, and decodes
 * without holding up the page. Each can take keyboard focus, so it can be opened full size with Enter as well as by
 * a click. The output adds only these attributes, so HtmlContent stays safe.
 */
export function prepareImages(html: string): string {
  if (!html.includes('<img')) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    img.setAttribute('loading', 'lazy')
    img.setAttribute('decoding', 'async')
    img.setAttribute('tabindex', '0')
  }
  return doc.body.innerHTML
}
