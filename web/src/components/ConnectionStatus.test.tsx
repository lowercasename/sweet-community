// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ConnectionStatus } from './ConnectionStatus'

/** Offline is shown as a badge in the bar. Live, connecting and reconnecting show nothing. */
afterEach(cleanup)

describe('ConnectionStatus', () => {
  it('renders nothing while live, connecting or reconnecting', () => {
    for (const status of ['live', 'connecting', 'reconnecting'] as const) {
      const { container } = render(<ConnectionStatus status={status} />)
      expect(container.textContent).toBe('')
      cleanup()
    }
  })

  it('renders an Offline badge while offline', () => {
    render(<ConnectionStatus status="offline" />)
    expect(screen.getByRole('status').textContent).toBe('Offline')
  })
})
