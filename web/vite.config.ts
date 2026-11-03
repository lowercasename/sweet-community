import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  build: {
    // The Go binary embeds this directory (internal/web/web.go).
    outDir: '../internal/web/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Listed first so it takes precedence over the generic /api rule.
      // SSE must stream: no websocket upgrade, no buffering, no compression.
      '/api/events': {
        target: backend,
        changeOrigin: false,
        ws: false,
        headers: { 'Accept-Encoding': 'identity' },
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            if ((proxyRes.headers['content-type'] ?? '').includes('text/event-stream')) {
              res.setHeader('Cache-Control', 'no-cache, no-transform')
              res.setHeader('X-Accel-Buffering', 'no')
              res.flushHeaders()
            }
          })
        },
      },
      '/api': { target: backend, changeOrigin: false },
      '/healthz': { target: backend, changeOrigin: false },
    },
  },
})
