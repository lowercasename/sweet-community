import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/ubuntu/300.css'
import '@fontsource/ubuntu/300-italic.css'
import '@fontsource/ubuntu/400.css'
import '@fontsource/ubuntu/400-italic.css'
import '@fontsource/ubuntu/500.css'
import '@fontsource/ubuntu/500-italic.css'
import '@fontsource/ubuntu/700.css'
import '@fontsource/ubuntu/700-italic.css'
import './global.css'
import { App } from './App'
import { makeQueryClient } from './data/client'
import { listenForInstall } from './install'

const queryClient = makeQueryClient()

// The browser's offer to install Sweet arrives soon after load, so it is caught before anything renders.
listenForInstall()

// The service worker is only for web push. It caches nothing.
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
