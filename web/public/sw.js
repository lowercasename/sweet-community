// Sweet's service worker (architecture.md, Notifications): web push only. It
// caches nothing and serves nothing, so the app is always what the server
// has. A push shows its title and line, and a tap opens where it points.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = { title: 'Sweet', body: '', url: '/', tag: undefined }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    // A push with no readable body still shows the title.
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Do not show a notification for a page that is open in a focused window.
      const path = new URL(data.url, self.location.origin).pathname
      if (windows.some((w) => w.focused && new URL(w.url).pathname === path)) return
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag,
        data: { url: data.url },
      })
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
