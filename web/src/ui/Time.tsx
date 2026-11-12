import { useEffect, useState } from 'react'

interface TimeProps {
  /** Unix milliseconds UTC. */
  at: number
}

/**
 * A short relative time, past or future. The server's clock and the browser's clock never agree exactly,
 * so a difference under a minute in either direction returns "just now".
 */
export function relative(at: number, now: number): string {
  const future = at > now
  const s = Math.round(Math.abs(now - at) / 1000)
  const wrap = (v: string) => (future ? `in ${v}` : `${v} ago`)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return wrap(`${m}m`)
  const h = Math.round(m / 60)
  if (h < 24) return wrap(`${h}h`)
  const d = Math.round(h / 24)
  if (d < 30) return wrap(`${d}d`)
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Returns the current time and re-renders once a minute, so a relative time such as "3m ago" stays current. */
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

/** A clock time in the viewer's locale, with the full date and time available on hover. */
export function ClockTime({ at }: TimeProps) {
  const date = new Date(at)
  return (
    <time className="whitespace-nowrap tabular-nums" dateTime={date.toISOString()} title={date.toLocaleString()}>
      {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
    </time>
  )
}

/** A relative time. The absolute UTC instant is in the dateTime and title attributes. */
export function Time({ at }: TimeProps) {
  const now = useNow()
  const iso = new Date(at).toISOString()
  return (
    <time className="whitespace-nowrap text-mute" dateTime={iso} title={iso}>
      {relative(at, now)}
    </time>
  )
}
