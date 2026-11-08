import { getPushKey, subscribePush, unsubscribePush } from './api'

/**
 * Web push on this device (architecture.md, Notifications). The browser
 * holds the subscription; the server keeps a copy so it can send. On an
 * iPhone it works only once Sweet is added to the home screen.
 */

export type PushState = 'unsupported' | 'install-first' | 'denied' | 'off' | 'on'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  )
}

/** Safari on iOS allows push only to an app on the home screen. */
function needsInstall(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches
  return ios && !standalone
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return needsInstall() ? 'install-first' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Ask the browser, then the server. Rejects with the reason when it cannot. */
export async function turnPushOn(): Promise<PushState> {
  const { key } = await getPushKey()
  const reg = await registration()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(key) })
  await subscribePush(sub.toJSON())
  return 'on'
}

export async function turnPushOff(): Promise<PushState> {
  const reg = await registration()
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await unsubscribePush(sub.endpoint)
    await sub.unsubscribe()
  }
  return 'off'
}

/** The server's base64url key as the bytes PushManager wants. */
function vapidKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = key + '='.repeat((4 - (key.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
