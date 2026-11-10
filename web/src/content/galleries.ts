/** Adjacent images render as a gallery of up to this many images. Longer runs are split. */
export const GALLERY_MAX = 8

/**
 * Prepares the images of a sanitised body for display, in one pass over the parsed HTML.
 *
 * Each run of adjacent top-level images is wrapped in <div class="gallery" data-count="N">, for the .gallery rules in
 * global.css. Stored HTML never contains gallery markup, so the editor and the sanitiser only ever see <img>. A run
 * of 2 or more images becomes galleries of at most GALLERY_MAX images each. A single leftover image stays plain.
 *
 * Each image loads lazily and decodes without holding up the page. An image that is not inside a link becomes a
 * focusable button named "Open image", which Body opens full size. Only these elements and attributes are added, so
 * the HTML stays safe for HtmlContent.
 */
export function prepareImages(html: string): string {
  if (!html.includes('<img')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let run: Element[] = []
  const flush = () => {
    for (let i = 0; i < run.length; i += GALLERY_MAX) {
      const chunk = run.slice(i, i + GALLERY_MAX)
      if (chunk.length < 2) break
      const gallery = doc.createElement('div')
      gallery.className = 'gallery'
      gallery.dataset.count = String(chunk.length)
      chunk[0].before(gallery)
      for (const img of chunk) gallery.appendChild(img)
    }
    run = []
  }
  for (const n of Array.from(doc.body.childNodes)) {
    if (n.nodeName === 'IMG') run.push(n as Element)
    else if (n.nodeType === Node.TEXT_NODE && !n.textContent?.trim()) continue
    else flush()
  }
  flush()
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    img.setAttribute('loading', 'lazy')
    img.setAttribute('decoding', 'async')
    if (img.closest('a')) continue
    img.setAttribute('tabindex', '0')
    img.setAttribute('role', 'button')
    const alt = img.getAttribute('alt')
    img.setAttribute('aria-label', alt ? `Open image: ${alt}` : 'Open image')
  }
  return doc.body.innerHTML
}
