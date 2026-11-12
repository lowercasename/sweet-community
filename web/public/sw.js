// Sweet's service worker. It handles web push only.
// It caches nothing and serves nothing, so the app is always the version that the
// server has. A push notification shows its title and body text, and a tap opens its URL.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Ask focused windows about the actual discussion and read position, not just their URL.
function hasReached(window, data) {
  if (!window.focused || !data.scope || !data.at) return Promise.resolve(false)
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const finish = (reached) => {
      clearTimeout(timeout)
      channel.port1.close()
      resolve(reached)
    }
    const timeout = setTimeout(() => finish(false), 300)
    channel.port1.onmessage = (event) => finish(event.data === true)
    window.postMessage({ type: 'reading', scope: data.scope, at: data.at }, [channel.port2])
  })
}

self.addEventListener('push', (event) => {
  let data = { title: 'Sweet', body: '', url: '/', tag: undefined }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    // A push with no readable body still shows the title.
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      if ((await Promise.all(windows.map((window) => hasReached(window, data)))).some(Boolean)) return
      const shown = data.tag ? await self.registration.getNotifications({ tag: data.tag }) : []
      if (
        shown.some(
          (n) =>
            n.data?.at > data.at ||
            (n.data?.at === data.at &&
              (n.data?.id > data.id || (n.data?.id === data.id && n.data?.revision >= data.revision))),
        )
      )
        return
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { id: data.id, revision: data.revision, url: data.url, scope: data.scope, at: data.at },
      })
    }),
  )
})

// Reading or clearing activity also closes matching alerts on this device.
self.addEventListener('message', (event) => {
  const data = event.data
  if (data?.type !== 'read' && data?.type !== 'clear') return
  event.waitUntil(
    self.registration.getNotifications().then((notifications) => {
      for (const notification of notifications) {
        const item = notification.data
        const sameVersion = !data.id || (item?.id === data.id && item.revision <= data.revision)
        if (sameVersion && item?.at <= data.at && (data.type === 'clear' || item.scope === data.scope))
          notification.close()
      }
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w)
      if (open) {
        open.navigate(url)
        return open.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
