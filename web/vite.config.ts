import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The Go binary embeds this directory (internal/web/web.go).
    outDir: '../internal/web/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Listed first so it takes precedence over the generic /api rule.
      // SSE must stream: no websocket upgrade and no compressed upstream body.
      // http-proxy pipes the response through unbuffered, and Vite's dev
      // server applies no compression, so events arrive as they are written.
      '/api/events': {
        target: backend,
        changeOrigin: false,
        ws: false,
        headers: { 'Accept-Encoding': 'identity' },
      },
      '/api': { target: backend, changeOrigin: false },
      '/healthz': { target: backend, changeOrigin: false },
    },
  },
})
