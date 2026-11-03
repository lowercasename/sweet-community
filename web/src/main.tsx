import React from 'react'
import ReactDOM from 'react-dom/client'
import './global.css'
import { Feed } from './pages/Feed'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Feed />
  </React.StrictMode>,
)
