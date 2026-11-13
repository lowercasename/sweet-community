// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Adding Sweet to the home screen. The browser's install offer is caught at start. An
 * iPhone or iPad has no offer, so it gets instructions instead. An installed app is never offered it again.
 */

const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

function setDevice(ua: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' ? standalone : false }))
}

/** A fake beforeinstallprompt event whose dialog answers with the given outcome. */
function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string }>
  }
  e.prompt = vi.fn(() => Promise.resolve())
  e.userChoice = Promise.resolve({ outcome })
  return e
}

beforeEach(() => vi.resetModules())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('install', () => {
  it('a browser with no offer and no iPhone has no way to install, until the offer arrives', async () => {
    setDevice(ANDROID)
    const { installWay, listenForInstall } = await import('./install')
    listenForInstall()
    expect(installWay()).toBe('none')
    const e = offer()
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(installWay()).toBe('dialog')
  })

  it('opening the dialog uses the offer, and accepting it counts as installed', async () => {
    setDevice(ANDROID)
    const { install, installWay, listenForInstall } = await import('./install')
    listenForInstall()
    const e = offer('accepted')
    window.dispatchEvent(e)
    await install()
    expect(e.prompt).toHaveBeenCalledTimes(1)
    expect(installWay()).toBe('installed')
  })

  it('a dismissed dialog cannot be opened again, so there is no way left', async () => {
    setDevice(ANDROID)
    const { install, installWay, listenForInstall } = await import('./install')
    listenForInstall()
    window.dispatchEvent(offer('dismissed'))
    await install()
    expect(installWay()).toBe('none')
  })

  it('an iPhone gets instructions, and the installed app on it gets nothing', async () => {
    setDevice(IPHONE)
    let mod = await import('./install')
    expect(mod.installWay()).toBe('ios')
    vi.resetModules()
    setDevice(IPHONE, true)
    mod = await import('./install')
    expect(mod.installWay()).toBe('installed')
  })

  it('the store app counts as installed, so it is never offered installation', async () => {
    setDevice(IPHONE)
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true })
    const { installWay, isInstalled } = await import('./install')
    expect(isInstalled()).toBe(true)
    expect(installWay()).toBe('installed')
  })

  it('an iPad that reports itself as a Mac is an iPad', async () => {
    setDevice(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    )
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5)
    const { installWay } = await import('./install')
    expect(installWay()).toBe('ios')
  })
})
