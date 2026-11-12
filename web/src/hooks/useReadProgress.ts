import { useEffect, useRef, type RefObject } from 'react'
import { useMarkRead, useMarkers } from '../data/hooks'
import { markerOf } from '../data/notifications'
import { setReading } from '../reading'
import { usePageVisible } from './usePageVisible'

/** One observer tracks the content reached in a visible chat or comment thread. */
export function useReadProgress(ref: RefObject<HTMLElement>, scope: string, active: boolean, version: string) {
  const visible = usePageVisible()
  const { markers, loaded } = useMarkers()
  const mark = useMarkRead()
  const current = useRef({ mark, readAt: 0 })
  current.current = { mark, readAt: markerOf(markers, scope) ?? 0 }
  useEffect(() => {
    if (!active || !visible || !loaded || !ref.current) return
    let reached = 0
    const owner = Symbol(scope)
    const shown = new Set<Element>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          shown.add(entry.target)
          reached = Math.max(reached, Number((entry.target as HTMLElement).dataset.readAt))
        } else shown.delete(entry.target)
      }
      setReading(owner, scope, shown.size > 0 ? reached : null)
      if (shown.size === 0 || reached === 0) return
      if (reached > current.current.readAt) current.current.mark(scope, reached, 800)
    })
    ref.current.querySelectorAll('[data-read-at]').forEach((point) => observer.observe(point))
    return () => {
      observer.disconnect()
      setReading(owner, scope, null)
    }
  }, [ref, scope, active, visible, loaded, version])
}
