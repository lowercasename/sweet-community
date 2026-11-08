/**
 * Adding Sweet to the home screen (architecture.md, Mobile). Chrome, Edge and Samsung Internet offer an install
 * dialog, which the page can open once. Safari and every browser on an iPhone or iPad have no such dialog, so the
 * person is told where Add to Home Screen is. On an iPhone, push works only in an app added to the home screen.
 */

/** How this browser can add Sweet to the home screen: it already has, with its dialog, by hand on iOS, or not at all. */
export type InstallWay = 'installed' | 'dialog' | 'ios' | 'none'

/** The browser's install offer. It is not in TypeScript's DOM types. */
interface InstallOffer extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let offer: InstallOffer | null = null
let accepted = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/**
 * Catches the browser's install offer. It is called once at start, because the browser sends the offer soon after
 * the page loads, before any component exists. Without preventDefault, Chrome shows its own small install bar.
 */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    offer = e as InstallOffer
    notify()
  })
  window.addEventListener('appinstalled', () => {
    accepted = true
    offer = null
    notify()
  })
}

/** Whether the page is running as the app added to the home screen. */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Whether this is an iPhone or iPad. An iPad reports itself as a Mac, and only its touch screen tells them apart. */
export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function installWay(): InstallWay {
  if (accepted || isInstalled()) return 'installed'
  if (offer) return 'dialog'
  if (isIOS()) return 'ios'
  return 'none'
}

/** Opens the browser's install dialog and resolves once the person has answered. The offer can be used once. */
export async function install(): Promise<void> {
  const o = offer
  if (!o) return
  offer = null
  await o.prompt()
  if ((await o.userChoice).outcome === 'accepted') accepted = true
  notify()
}

/** Calls the listener whenever installWay may have changed. Returns the function that stops it. */
export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
