import { useEffect, useState, useSyncExternalStore } from 'react'
import { SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN } from '../ui'

export type Layout = 'both' | 'posts' | 'chat'

const KEY = 'sweet.layout'
const SPLIT_KEY = 'sweet.split'
const NAV_KEY = 'sweet.nav'
/** The phone layout: one pane and a tab bar. */
export const NARROW = '(max-width: 799px)'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage unavailable
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The stored layout is a per-viewer convenience only, so a failed write is ignored.
  }
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

interface LayoutState {
  stored: Layout
  ratio: number
  navExpanded: boolean
}

// One store for the whole page. The tab bar in one
// component changes the layout, and the panes in another component follow.
// Two hook calls that each kept their own state once left the Posts tab
// highlighted while the chat pane was still showing.
let state: LayoutState | null = null
const listeners = new Set<() => void>()

function current(): LayoutState {
  if (!state) {
    const v = read(KEY)
    const r = Number(read(SPLIT_KEY))
    state = {
      stored: v === 'both' || v === 'posts' || v === 'chat' ? v : 'both',
      ratio: r >= SPLIT_MIN && r <= SPLIT_MAX ? r : SPLIT_DEFAULT,
      // The nav starts expanded, so a new user sees its labels. It stays collapsed only once someone collapses it
      // (Raphael, 2026-11-09).
      navExpanded: read(NAV_KEY) !== 'collapsed',
    }
  }
  return state
}

function update(patch: Partial<LayoutState>) {
  state = { ...current(), ...patch }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/**
 * Which panes are open, how wide the posts pane is, and whether the nav is
 * expanded. All three persist per browser. On a narrow screen only one pane
 * shows, so `both` resolves to chat.
 */
export function useLayout(): {
  layout: Layout
  narrow: boolean
  ratio: number
  navExpanded: boolean
  setLayout: (l: Layout) => void
  setRatio: (r: number) => void
  toggleNav: () => void
} {
  const s = useSyncExternalStore(subscribe, current, current)
  const narrow = useMediaQuery(NARROW)

  const setLayout = (l: Layout) => {
    update({ stored: l })
    write(KEY, l)
  }
  const setRatio = (r: number) => {
    update({ ratio: r })
    write(SPLIT_KEY, String(r))
  }
  const toggleNav = () => {
    const next = !current().navExpanded
    update({ navExpanded: next })
    write(NAV_KEY, next ? 'expanded' : 'collapsed')
  }

  const layout: Layout = narrow && s.stored === 'both' ? 'chat' : s.stored
  return { layout, narrow, ratio: s.ratio, navExpanded: s.navExpanded, setLayout, setRatio, toggleNav }
}
