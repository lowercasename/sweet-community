// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayLabel, sameDay, Time } from './Time'

const now = new Date(2026, 10, 12, 0, 5).getTime()

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('calendar dates', () => {
  it('labels local calendar days rather than elapsed twenty-four-hour periods', () => {
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

describe('Time', () => {
  it.each([
    ['today', new Date(2026, 10, 12, 0, 1), ''],
    ['yesterday', new Date(2026, 10, 11, 23, 55), 'Yesterday at '],
    ['older', new Date(2025, 10, 10, 14, 32), null],
    ['future', new Date(2026, 10, 19, 14, 32), null],
  ])('shows a clock time with the date needed for %s', (_, date, prefix) => {
    vi.useFakeTimers().setSystemTime(now)
    render(<Time at={date.getTime()} />)
    const time = screen.getByRole('time')
    const label =
      prefix ?? `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} at `
    expect(time.textContent).toBe(label + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
    expect(time.getAttribute('datetime')).toBe(date.toISOString())
    expect(time.getAttribute('title')).toBe(date.toLocaleString())
  })

  it('omits the date when a chat divider supplies it', () => {
    vi.useFakeTimers().setSystemTime(now)
    const date = new Date(2026, 10, 10, 14, 32)
    render(<Time at={date.getTime()} format="time" />)
    expect(screen.getByRole('time').textContent).toBe(
      date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    )
  })

  it('updates the day label when midnight passes', () => {
    const date = new Date(2026, 10, 11, 23, 59)
    vi.useFakeTimers().setSystemTime(date)
    render(<Time at={date.getTime()} />)
    expect(screen.getByRole('time').textContent).not.toContain('Yesterday')
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('time').textContent).toContain('Yesterday at ')
  })
})

it('can show just the calendar date for membership details', () => {
  const date = new Date(2026, 10, 3, 21, 29)
  const { container } = render(<Time at={date.getTime()} format="date" />)
  expect(container.querySelector('time')?.textContent).toBe(
    date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
  )
})
