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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
