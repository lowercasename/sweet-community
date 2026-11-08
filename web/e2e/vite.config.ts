// The dev server configured as Raphael runs it, with the proxy pointed at the e2e backend on port 8098.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = 'http://127.0.0.1:8098'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Playwright checks 127.0.0.1. Vite's default host "localhost" may bind only to ::1.
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    proxy: {
      '/api/events': { target: backend, changeOrigin: false, ws: false, headers: { 'Accept-Encoding': 'identity' } },
      '/api': { target: backend, changeOrigin: false },
      '/healthz': { target: backend, changeOrigin: false },
      '/img': { target: backend, changeOrigin: false },
    },
  },
})
