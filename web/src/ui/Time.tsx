import { useEffect, useState } from 'react'

interface TimeProps {
  /** Unix milliseconds UTC. */
  at: number
  /** The surrounding chat divider already shows the date. */
  clockOnly?: boolean
}

/** Re-renders once a minute so calendar labels change after midnight. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

export function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export function dayLabel(at: number, now: number): string {
  if (sameDay(at, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(at, yesterday.getTime())) return 'Yesterday'
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** A local timestamp. Chat omits the date supplied by its day divider. */
export function Time({ at, clockOnly = false }: TimeProps) {
  const now = useNow()
  const date = new Date(at)
  const label = !clockOnly && !sameDay(at, now) ? dayLabel(at, now) : null
  return (
    <time className="text-mute tabular-nums" dateTime={date.toISOString()} title={date.toLocaleString()}>
      {label && `${label} at `}
      <span className="whitespace-nowrap">
        {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </span>
    </time>
  )
}
