import { useEffect, useState } from 'react'

export type Layout = 'both' | 'posts' | 'chat'

/** Two shell treatments to compare; `rails` folds a closed pane into a vertical strip. */
export type ShellUI = 'rails' | 'header'

const KEY = 'sweet.layout'
const UI_KEY = 'sweet.ui'
const NARROW = '(max-width: 799px)'

function load(): Layout {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'both' || v === 'posts' || v === 'chat') return v
  } catch {
    // storage unavailable; fall through
  }
  return 'both'
}

/** `?ui=rails` or `?ui=header` picks a shell and remembers it; otherwise the remembered one, else rails. */
function loadUI(): ShellUI {
  const fromUrl = new URLSearchParams(window.location.search).get('ui')
  try {
    if (fromUrl === 'rails' || fromUrl === 'header') {
      localStorage.setItem(UI_KEY, fromUrl)
      return fromUrl
    }
    if (localStorage.getItem(UI_KEY) === 'header') return 'header'
  } catch {
    // storage unavailable; fall through
  }
  return fromUrl === 'header' ? 'header' : 'rails'
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const on = () => setMatches(mql.matches)
    on()
    mql.addEventListener('change', on)
    return () => mql.removeEventListener('change', on)
  }, [query])
  return matches
}

/**
 * Which panes are open. The preference persists per browser; on a narrow
 * screen only one pane shows, so `both` resolves to chat there.
 */
export function useLayout(): { layout: Layout; narrow: boolean; ui: ShellUI; setLayout: (l: Layout) => void } {
  const [stored, setStored] = useState<Layout>(load)
  const [ui] = useState<ShellUI>(loadUI)
  const narrow = useMediaQuery(NARROW)
  const setLayout = (l: Layout) => {
    setStored(l)
    try {
      localStorage.setItem(KEY, l)
    } catch {
      // per-viewer convenience only
    }
  }
  const layout: Layout = narrow && stored === 'both' ? 'chat' : stored
  return { layout, narrow, ui, setLayout }
}
