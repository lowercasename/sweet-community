// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ConnectionStatus } from './ConnectionStatus'

/** The event stream's state is shown as a notice in the shared Alert component, or not shown while live. */
afterEach(cleanup)

describe('ConnectionStatus', () => {
  it('renders nothing while live, a notice while connecting, and a warning while offline', () => {
    const { container } = render(<ConnectionStatus status="live" />)
    expect(container.textContent).toBe('')
    cleanup()
    render(<ConnectionStatus status="reconnecting" />)
    expect(screen.getByRole('status').textContent).toBe('Reconnecting…')
    cleanup()
    render(<ConnectionStatus status="offline" />)
    expect(screen.getByRole('status').textContent).toBe('Offline: you can read but not post')
  })
})
