import { renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The store app's own page (app.html), packaged inside the iOS and Android apps. Capacitor serves dist-app/ and
// starts at its index.html, so the built app.html is renamed. Communities themselves are loaded from their instances.
const outDir = resolve(__dirname, 'dist-app')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'app-page-as-index',
      closeBundle() {
        renameSync(resolve(outDir, 'app.html'), resolve(outDir, 'index.html'))
      },
    },
  ],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'app.html') },
  },
  server: { port: 5174 },
})
