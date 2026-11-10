// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getMe } from './api'

/**
 * An error is shown to the user as it is. The server's own error sentences pass through. Anything else, such as a
 * proxy's 502 page or a lost connection, becomes a plain sentence that names no status code.
 */
afterEach(() => vi.unstubAllGlobals())

const respond = (body: string, status: number, type: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { status, headers: { 'Content-Type': type } }))),
  )

describe('request errors', () => {
  it("passes the server's own error sentence through", async () => {
    respond(JSON.stringify({ error: 'That image is too large' }), 422, 'application/json')
    await expect(getMe()).rejects.toMatchObject({ status: 422, message: 'That image is too large' })
  })

  it("turns a proxy's error page into a plain sentence with no status code", async () => {
    respond('<html><body>502 Bad Gateway</body></html>', 502, 'text/html')
    const e = await getMe().catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).status).toBe(502)
    expect((e as ApiError).message).toBe('Something went wrong. Try again in a moment.')
  })

  it('turns a page sent instead of data into the same sentence', async () => {
    respond('<!doctype html><html></html>', 200, 'text/html')
    await expect(getMe()).rejects.toMatchObject({ message: 'Something went wrong. Try again in a moment.' })
  })

  it('says so when the connection fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    await expect(getMe()).rejects.toMatchObject({ message: 'Could not connect. Check your connection and try again.' })
  })
})
