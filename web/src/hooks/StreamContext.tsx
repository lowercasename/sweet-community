import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useEventStream, type EventHandler, type StreamStatus } from './useEventStream'

interface Stream {
  status: StreamStatus
  /** Adds a listener for every event; returns the remover. */
  subscribe: (handler: EventHandler) => () => void
}

const StreamContext = createContext<Stream>({ status: 'connecting', subscribe: () => () => {} })

/** One SSE connection per page, fanned out to whichever panes are mounted. */
export function StreamProvider({ children }: { children?: ReactNode }) {
  const listeners = useRef(new Set<EventHandler>())
  const onEvent = useCallback<EventHandler>((kind, data, seq) => {
    for (const l of listeners.current) l(kind, data, seq)
  }, [])
  const { status } = useEventStream(onEvent)
  const subscribe = useCallback((handler: EventHandler) => {
    listeners.current.add(handler)
    return () => {
      listeners.current.delete(handler)
    }
  }, [])
  const value = useMemo(() => ({ status, subscribe }), [status, subscribe])
  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>
}

export function useStreamStatus(): StreamStatus {
  return useContext(StreamContext).status
}

/** Calls `handler` for every event while the component is mounted. */
export function useStreamEvents(handler: EventHandler) {
  const { subscribe } = useContext(StreamContext)
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => subscribe((kind, data, seq) => ref.current(kind, data, seq)), [subscribe])
}
