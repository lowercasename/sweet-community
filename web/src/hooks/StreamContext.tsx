import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applyEvent } from '../data/apply'
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
  const { status } = useEventStream(onEvent)

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
