import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { prepareImages } from '../content/galleries'

interface HtmlContentProps {
  /** HTML that has ALREADY been sanitised by the server (bluemonday). */
  html: string
  /** `small` is for a comment. A smaller font size than the post it replies to. */
  size?: 'body' | 'small'
  /** Called on a click anywhere in the body. Body uses it to route the mention anchors it created without a page load. */
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  /** Called on a key press in the body, such as Enter on an image. */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  /**
   * Draws the card for each link preview in the body, a <p data-embed> holding one link. The card is drawn inside the
   * paragraph, and the link stays as the fallback when no card is drawn.
   */
  embed?: (url: string) => ReactNode
}

/**
 * Renders server-sanitised HTML with the .content styles from global.css.
 * Runs of adjacent images are wrapped as galleries at render time, and every
 * image loads lazily and can take focus.
 *
 * This is the ONE component in the codebase allowed to use dangerouslySetInnerHTML.
 * It is safe only because every body passes through the server's bluemonday policy
 * before storage. Nothing client-generated may be passed here unsanitised.
 * `pnpm check:atomic` fails if dangerouslySetInnerHTML appears anywhere else.
 */
export function HtmlContent({ html, size = 'body', onClick, onKeyDown, embed }: HtmlContentProps) {
  const rendered = useMemo(() => prepareImages(html), [html])
  const ref = useRef<HTMLDivElement>(null)
  // The renderer is read through a ref, so a new function on every render does not find the paragraphs again.
  const embedRef = useRef(embed)
  embedRef.current = embed
  const drawCards = embed !== undefined
  const [slots, setSlots] = useState<{ el: Element; url: string }[]>([])
  useLayoutEffect(() => {
    const root = ref.current
    if (!drawCards || !root) {
      setSlots([])
      return
    }
    setSlots(
      [...root.querySelectorAll('p[data-embed]')].flatMap((el) => {
        const url = el.querySelector('a')?.getAttribute('href')
        return url ? [{ el, url }] : []
      }),
    )
  }, [rendered, drawCards])
  return (
    <>
      <div
        ref={ref}
        className={size === 'small' ? 'content text-[15px]' : 'content'}
        onClick={onClick}
        onKeyDown={onKeyDown}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
      {slots.map((s, i) => createPortal(embedRef.current?.(s.url), s.el, `${i}:${s.url}`))}
    </>
  )
}
