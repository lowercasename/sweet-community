// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEventStream } from './useEventStream'

/**
 * The stream's first event names the server's version. A tab keeps the one
 * it was given and reloads when a later connection reports another: the
 * frontend is embedded in the binary, so a different version is a
 * different app (architecture.md, Updates: Clients).
 */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readyState = FakeEventSource.OPEN
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  private listeners = new Map<string, (ev: MessageEvent<string>) => void>()
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(kind: string, fn: (ev: MessageEvent<string>) => void) {
    this.listeners.set(kind, fn)
  }
  close() {
    this.readyState = FakeEventSource.CLOSED
  }
  emit(kind: string, data: string, lastEventId = '') {
    this.listeners.get(kind)?.({ data, lastEventId } as MessageEvent<string>)
  }
}

const reload = vi.fn()

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.spyOn(window.location, 'reload').mockImplementation(reload)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  reload.mockClear()
})

const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]

describe('useEventStream version', () => {
  it('reloads when a reconnection reports a different version, not the same one', () => {
    renderHook(() => useEventStream(() => {}))
    act(() => latest().emit('version', '"one"'))
    expect(reload).not.toHaveBeenCalled()

    // Coming back online reopens the stream (as the hook does on its own).
    act(() => window.dispatchEvent(new Event('online')))
    act(() => latest().emit('version', '"one"'))
    expect(reload).not.toHaveBeenCalled()

    act(() => window.dispatchEvent(new Event('online')))
    act(() => latest().emit('version', '"two"'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not count the version as an event', () => {
    const onEvent = vi.fn()
    const { result } = renderHook(() => useEventStream(onEvent))
    act(() => latest().emit('version', '"one"'))
    expect(onEvent).not.toHaveBeenCalled()
    expect(result.current.lastSeq).toBe(0)
  })
})
