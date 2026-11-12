/** Local visibility is used only to suppress a device alert. The server owns read state. */
const reading = new Map<symbol, { scope: string; at: number }>()

export function setReading(owner: symbol, scope: string, at: number | null) {
  if (at === null) reading.delete(owner)
  else reading.set(owner, { scope, at })
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'reading') return
    const reached = [...reading.values()].some((r) => r.scope === event.data.scope && r.at >= event.data.at)
    event.ports[0]?.postMessage(document.visibilityState === 'visible' && document.hasFocus() && reached)
  })
}

export function dismissDeviceNotifications(at: number, scope?: string, id?: string, revision?: number) {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.controller?.postMessage({ type: scope || id ? 'read' : 'clear', at, scope, id, revision })
}
