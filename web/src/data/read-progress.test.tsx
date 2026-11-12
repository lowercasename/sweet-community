// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useMarkRead } from './hooks'
import { marker, renderWithQuery } from '../test-utils'
import { Button } from '../ui'

vi.mock('../api', () => ({ setMarker: vi.fn(async (stream, at) => marker(stream, at, 0)) }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('keeps the furthest read position when older content is reached during the debounce', async () => {
  vi.useFakeTimers()
  const { setMarker } = await import('../api')
  function Reading() {
    const mark = useMarkRead()
    return (
      <Button
        onClick={() => {
          mark('chat:room', 200, 800)
          mark('chat:room', 100, 800)
        }}
      >
        Read
      </Button>
    )
  }
  renderWithQuery(<Reading />)
  fireEvent.click(screen.getByRole('button', { name: 'Read' }))
  await vi.advanceTimersByTimeAsync(800)
  expect(setMarker).toHaveBeenCalledExactlyOnceWith('chat:room', 200)
})
