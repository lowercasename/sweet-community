import React from 'react'
import ReactDOM from 'react-dom/client'
// Fonts are bundled, not fetched from Google: a self-hosted instance phones nobody.
import '@fontsource/ubuntu/400.css'
import '@fontsource/ubuntu/400-italic.css'
import '@fontsource/ubuntu/500.css'
import '@fontsource/ubuntu/700.css'
import '@fontsource/quicksand/700.css'
import './global.css'
import { Home } from './pages/Home'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
)
