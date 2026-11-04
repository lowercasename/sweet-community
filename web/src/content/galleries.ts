/** Adjacent images render as a gallery of up to this many; longer runs split. */
export const GALLERY_MAX = 8

/**
 * Wrap each run of adjacent top-level <img> elements in
 * <div class="gallery" data-count="N">, for the .gallery rules in global.css.
 * Stored HTML never carries gallery markup (architecture.md): this is a
 * render-time view of plain images, so the editor and the sanitiser only
 * ever see <img>. A run of 2 or more becomes galleries of at most
 * GALLERY_MAX; a leftover single image stays a plain image.
 */
export function wrapGalleries(html: string): string {
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
  return doc.body.innerHTML
}
