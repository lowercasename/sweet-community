import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
// The font is bundled, not fetched from Google: a self-hosted instance phones nobody.
import '@fontsource/ubuntu/400.css'
import '@fontsource/ubuntu/400-italic.css'
import '@fontsource/ubuntu/500.css'
import '@fontsource/ubuntu/700.css'
import './global.css'
import { App } from './App'
import { makeQueryClient } from './data/client'

const queryClient = makeQueryClient()

// The service worker is for web push alone (architecture.md, Notifications): it caches nothing.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Without it there is no push; everything else works.
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
