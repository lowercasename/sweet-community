import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
// The font is bundled, not fetched from Google, so that a self-hosted instance makes no third-party requests.
import '@fontsource/ubuntu/400.css'
import '@fontsource/ubuntu/400-italic.css'
import '@fontsource/ubuntu/500.css'
import '@fontsource/ubuntu/700.css'
import './global.css'
import { App } from './App'
import { makeQueryClient } from './data/client'

const queryClient = makeQueryClient()

// The service worker is only for web push (architecture.md, Notifications). It caches nothing.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Without the service worker there is no push. Everything else still works.
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
