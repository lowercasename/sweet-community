import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applyEvent, signedOut } from '../data/apply'
import { keys } from '../data/keys'
import { useEventStream, type StreamStatus } from './useEventStream'

const StreamContext = createContext<StreamStatus>('connecting')

/**
 * One SSE connection per page, writing directly into the query cache.
 * Nothing else listens to the stream. A
 * reconnect after a disconnection invalidates every query. The stream replays
 * the missed events, and the invalidation is a second safeguard.
 */
export function StreamProvider({ children }: { children?: ReactNode }) {
  const qc = useQueryClient()
  const onEvent = useCallback((kind: string, data: unknown) => applyEvent(qc, kind, data), [qc])
  // A signed_out event signs the page out. When the browser gives up on the stream, the page asks who is signed in.
  // A 401 then signs it out too, and a failure leaves the user as they were.
  const { status } = useEventStream(onEvent, {
    onSignedOut: () => signedOut(qc),
    onClosed: () => void qc.invalidateQueries({ queryKey: keys.me }),
  })

  const previous = useRef<StreamStatus>('connecting')
  useEffect(() => {
    const wasAway = previous.current === 'reconnecting' || previous.current === 'offline'
    if (status === 'live' && wasAway) void qc.invalidateQueries()
    previous.current = status
  }, [status, qc])

  return <StreamContext.Provider value={status}>{children}</StreamContext.Provider>
}

export function useStreamStatus(): StreamStatus {
  return useContext(StreamContext)
}
