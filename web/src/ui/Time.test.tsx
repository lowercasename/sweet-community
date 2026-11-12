// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { dayLabel, relative, sameDay } from './Time'

const now = 1_700_000_000_000
const minute = 60_000
const day = 24 * 60 * minute

describe('chat dates', () => {
  it('labels local calendar days rather than elapsed twenty-four-hour periods', () => {
    const now = new Date(2026, 10, 12, 0, 5).getTime()
    expect(dayLabel(now, now)).toBe('Today')
    expect(dayLabel(new Date(2026, 10, 11, 23, 55).getTime(), now)).toBe('Yesterday')
    const earlier = new Date(2026, 10, 10, 23, 55)
    expect(dayLabel(earlier.getTime(), now)).toBe(
      earlier.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
    )
    expect(sameDay(now, new Date(2026, 10, 11, 23, 55).getTime())).toBe(false)
    expect(sameDay(now, new Date(2026, 10, 12, 23, 55).getTime())).toBe(true)
  })
})

describe('relative', () => {
  it('returns just now for small differences in either direction, since a server and a browser never agree to the millisecond', () => {
    expect(relative(now - 10_000, now)).toBe('just now')
    expect(relative(now + 300, now)).toBe('just now')
    expect(relative(now + 44_000, now)).toBe('just now')
  })

  it('counts minutes, hours and days, past and future', () => {
    expect(relative(now - 3 * minute, now)).toBe('3m ago')
    expect(relative(now - 5 * 60 * minute, now)).toBe('5h ago')
    expect(relative(now + 7 * day, now)).toBe('in 7d')
  })

  it('returns a date for differences over a month', () => {
    expect(relative(now - 40 * day, now)).toMatch(/\d{4}/)
  })
})
