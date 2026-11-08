import { getPushKey, subscribePush, unsubscribePush } from './api'
import { isInstalled, isIOS } from './install'

/**
 * Web push on this device (architecture.md, Notifications). The browser
 * holds the subscription, and the server keeps a copy so it can send pushes.
 * On an iPhone push works only once Sweet is added to the home screen.
 */

export type PushState = 'unsupported' | 'install-first' | 'denied' | 'off' | 'on'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  )
}

/** Safari on iOS allows push only for an app added to the home screen. */
function needsInstall(): boolean {
  return isIOS() && !isInstalled()
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

/** Requests permission from the browser, then subscribes with the server. Rejects with the reason on failure. */
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

/** Decodes the server's base64url key into the bytes PushManager expects. */
function vapidKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = key + '='.repeat((4 - (key.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
