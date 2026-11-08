import { useEffect, useRef, useState } from 'react'
import { EVENT_KINDS } from '../data/apply'

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

export type EventHandler = (kind: string, data: unknown, seq: number) => void

const HEALTH_INTERVAL_MS = 30_000
const HEALTH_TIMEOUT_MS = 10_000

/**
 * Subscribes to GET /api/events and resyncs from the last seen seq on every
 * reconnect. EventSource cannot see the server's `: hb` comment lines, so
 * liveness is checked by pinging /healthz every 30 s while the page is
 * visible. iOS kills background sockets while readyState stays OPEN, so the
 * stream is force-reopened on visibilitychange, pageshow and online.
 */
export function useEventStream(onEvent: EventHandler): { status: StreamStatus; lastSeq: number } {
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [lastSeq, setLastSeq] = useState(0)

  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent
  const lastSeqRef = useRef(0)
  const statusRef = useRef<StreamStatus>('connecting')
  const sourceRef = useRef<EventSource | null>(null)
  // The server's version as this tab first received it. The frontend is
  // embedded in the binary, so a different version later is a different app.
  const versionRef = useRef<string | null>(null)

  useEffect(() => {
    let disposed = false

    const update = (s: StreamStatus) => {
      statusRef.current = s
      setStatus(s)
    }

    const close = () => {
      sourceRef.current?.close()
      sourceRef.current = null
    }

    const open = () => {
      if (disposed) return
      close()
      if (!navigator.onLine) {
        update('offline')
        return
      }
      update(lastSeqRef.current === 0 ? 'connecting' : 'reconnecting')

      const seq = lastSeqRef.current
      const url = seq > 0 ? `/api/events?since=${seq}` : '/api/events'
      const es = new EventSource(url)
      sourceRef.current = es

      es.onopen = () => update('live')
      es.onerror = () => {
        // The browser retries on its own while readyState is CONNECTING.
        // If it has given up (CLOSED), we reopen with ?since= ourselves.
        update(navigator.onLine ? 'reconnecting' : 'offline')
        if (es.readyState === EventSource.CLOSED) {
          window.setTimeout(() => {
            if (sourceRef.current === es) open()
          }, 3_000)
        }
      }

      es.addEventListener('version', (ev: MessageEvent<string>) => {
        let v = ev.data
        try {
          v = JSON.parse(ev.data) as string
        } catch {
          // leave as the raw string
        }
        if (versionRef.current === null) versionRef.current = v
        else if (versionRef.current !== v) window.location.reload()
      })

      for (const kind of EVENT_KINDS) {
        es.addEventListener(kind, (ev: MessageEvent<string>) => {
          const seq = Number.parseInt(ev.lastEventId, 10)
          if (Number.isFinite(seq) && seq > lastSeqRef.current) {
            lastSeqRef.current = seq
            setLastSeq(seq)
          }
          let data: unknown = ev.data
          try {
            data = JSON.parse(ev.data)
          } catch {
            // leave as the raw string
          }
          handlerRef.current(kind, data, seq)
        })
      }
    }

    const ping = async () => {
      if (document.visibilityState !== 'visible') return
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS)
      try {
        const res = await fetch('/healthz', { cache: 'no-store', signal: ctrl.signal })
        if (!res.ok) throw new Error(String(res.status))
        // The server is reachable again after an outage. The socket is almost certainly dead, so reopen it.
        if (statusRef.current === 'offline') open()
      } catch {
        if (!disposed) update('offline')
      } finally {
        window.clearTimeout(timer)
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') open()
    }
    const onOnline = () => open()
    const onOffline = () => {
      update('offline')
      close()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onOnline)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const health = window.setInterval(ping, HEALTH_INTERVAL_MS)

    open()

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onOnline)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.clearInterval(health)
      close()
    }
  }, [])

  return { status, lastSeq }
}
