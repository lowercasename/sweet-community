// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface DeviceAlert {
  tag?: string
  data: { id: string; revision: number; scope: string; at: number }
  close: () => void
}

afterEach(() => vi.unstubAllGlobals())

function worker(reached: boolean, shown: DeviceAlert[] = []) {
  const listeners = new Map<string, (event: unknown) => void>()
  const showNotification = vi.fn()
  const window = {
    focused: true,
    url: 'https://sweet.test/',
    postMessage: (_: unknown, ports: { postMessage: (value: boolean) => void }[]) => ports[0].postMessage(reached),
  }
  class Channel {
    port1 = { onmessage: null as null | ((e: { data: boolean }) => void), close() {} }
    port2 = { postMessage: (data: boolean) => this.port1.onmessage?.({ data }) }
  }
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL,
    setTimeout,
    clearTimeout,
    MessageChannel: Channel,
    self: {
      addEventListener: (kind: string, fn: (e: unknown) => void) => listeners.set(kind, fn),
      location: { origin: 'https://sweet.test' },
      clients: { matchAll: async () => [window] },
      registration: {
        showNotification,
        getNotifications: async (options?: { tag: string }) => shown.filter((n) => !options || n.tag === options.tag),
      },
    },
  })
  return {
    showNotification,
    async message(data: unknown) {
      let work: Promise<unknown> | undefined
      listeners.get('message')!({
        data,
        waitUntil: (p: Promise<unknown>) => {
          work = p
        },
      })
      await work
    },
    async push(overrides = {}) {
      let work: Promise<unknown> | undefined
      listeners.get('push')!({
        data: {
          json: () => ({
            title: 'Sweet',
            body: 'A message',
            url: '/',
            scope: 'chat:root',
            at: 100,
            tag: 'chat:root',
            ...overrides,
          }),
        },
        waitUntil: (p: Promise<unknown>) => {
          work = p
        },
      })
      await work
    },
  }
}

describe('device notification visibility', () => {
  it('shows an alert when the page is focused but the message has not been reached', async () => {
    const w = worker(false)
    await w.push()
    expect(w.showNotification).toHaveBeenCalledWith(
      'Sweet',
      expect.objectContaining({ tag: 'chat:root', renotify: true }),
    )
  })
  it('suppresses an alert only when a focused window has reached that activity', async () => {
    const w = worker(true)
    await w.push()
    expect(w.showNotification).not.toHaveBeenCalled()
  })
})

it('does not replace a newer displayed alert with an older push', async () => {
  const w = worker(false, [
    { tag: 'chat:root', data: { id: 'n1', revision: 2, scope: 'chat:root', at: 200 }, close: vi.fn() },
  ])
  await w.push({ id: 'n1', revision: 1 })
  expect(w.showNotification).not.toHaveBeenCalled()
})

it('does not suppress an ungrouped report because another alert is newer', async () => {
  const w = worker(false, [
    { tag: 'chat:root', data: { id: 'n1', revision: 2, scope: 'chat:root', at: 200 }, close: vi.fn() },
  ])
  await w.push({ id: 'report', scope: '', tag: undefined, revision: 1 })
  expect(w.showNotification).toHaveBeenCalledOnce()
})

it('reading a report closes only that report alert', async () => {
  const postMessage = vi.fn()
  vi.stubGlobal('navigator', { serviceWorker: { addEventListener: vi.fn(), controller: { postMessage } } })
  const { dismissDeviceNotifications } = await import('./reading')
  dismissDeviceNotifications(200, '', 'report', 1)
  expect(postMessage).toHaveBeenCalledWith({ type: 'read', at: 200, scope: '', id: 'report', revision: 1 })
  const report = { data: { id: 'report', revision: 1, scope: '', at: 200 }, close: vi.fn() }
  const chat = { tag: 'chat:root', data: { id: 'n1', revision: 1, scope: 'chat:root', at: 100 }, close: vi.fn() }
  const w = worker(false, [report, chat])
  await w.message(postMessage.mock.calls[0][0])
  expect(report.close).toHaveBeenCalledOnce()
  expect(chat.close).not.toHaveBeenCalled()
})
