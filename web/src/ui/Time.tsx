import { useEffect, useState } from 'react'

interface TimeProps {
  /** Unix milliseconds UTC. */
  at: number
}

function relative(at: number, now: number): string {
  const s = Math.round((now - at) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Re-renders once a minute so "3m ago" keeps up. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

/** Relative time with the absolute UTC instant in dateTime and title. */
export function Time({ at }: TimeProps) {
  const now = useNow()
  const iso = new Date(at).toISOString()
  return (
    <time className="whitespace-nowrap text-mute" dateTime={iso} title={iso}>
      {relative(at, now)}
    </time>
  )
}
