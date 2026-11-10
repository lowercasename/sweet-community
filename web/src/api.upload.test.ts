// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadImage } from './api'

/** A stand-in for XMLHttpRequest that the test finishes by hand. */
class FakeRequest {
  static last: FakeRequest
  status = 201
  responseText = JSON.stringify({ id: 'a', url: '/img/a', width: 1, height: 1 })
  aborted = false
  upload: {
    onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void
    onload?: () => void
  } = {}
  onload?: () => void
  onabort?: () => void
  onerror?: () => void
  onloadend?: () => void
  constructor() {
    FakeRequest.last = this
  }
  open() {}
  setRequestHeader() {}
  getResponseHeader() {
    return 'application/json'
  }
  send() {}
  abort() {
    this.aborted = true
    this.onabort?.()
    this.onloadend?.()
  }
  finish() {
    this.onload?.()
    this.onloadend?.()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('XMLHttpRequest', FakeRequest)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Whether a promise has settled, without waiting for it. */
async function settled(p: Promise<unknown>) {
  let done = false
  p.then(
    () => (done = true),
    () => (done = true),
  )
  await Promise.resolve()
  return done
}

describe('uploadImage', () => {
  it('fails when nothing has been sent for 30 seconds', async () => {
    const upload = uploadImage(new Blob(['x']))
    vi.advanceTimersByTime(30_000)
    await expect(upload).rejects.toMatchObject({ status: 0 })
  })

  it('keeps going while data is sent', async () => {
    const upload = uploadImage(new Blob(['x']))
    vi.advanceTimersByTime(20_000)
    FakeRequest.last.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 })
    vi.advanceTimersByTime(20_000)
    expect(await settled(upload)).toBe(false)
    FakeRequest.last.finish()
    await expect(upload).resolves.toMatchObject({ id: 'a' })
  })

  it('fails when no answer comes a minute after the last byte', async () => {
    const upload = uploadImage(new Blob(['x']))
    FakeRequest.last.upload.onload?.()
    vi.advanceTimersByTime(59_000)
    expect(await settled(upload)).toBe(false)
    vi.advanceTimersByTime(1_000)
    await expect(upload).rejects.toMatchObject({ status: 0 })
  })

  it('ignores its signal once the upload has finished', async () => {
    const stop = new AbortController()
    const upload = uploadImage(new Blob(['x']), undefined, stop.signal)
    const request = FakeRequest.last
    request.finish()
    await upload
    stop.abort()
    expect(request.aborted).toBe(false)
  })
})
