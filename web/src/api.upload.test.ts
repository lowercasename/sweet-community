// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadImage } from './api'

/** A stand-in for XMLHttpRequest that answers each request with an uploaded image. */
class FakeRequest {
  status = 201
  responseText = JSON.stringify({ id: 'a', url: '/img/a', width: 1, height: 1 })
  upload: { onprogress?: unknown; onload?: unknown } = {}
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  onloadend?: () => void
  open() {}
  setRequestHeader() {}
  getResponseHeader() {
    return 'application/json'
  }
  abort() {}
  send() {
    setTimeout(() => {
      this.onload?.()
      this.onloadend?.()
    })
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('uploadImage', () => {
  it('stops listening to its signal once the upload has finished', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeRequest)
    const stop = new AbortController()
    const removed = vi.spyOn(stop.signal, 'removeEventListener')
    await uploadImage(new Blob(['x']), undefined, stop.signal)
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
