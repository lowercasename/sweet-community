import { useEffect, useState } from 'react'
import { SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN } from '../ui'

export type Layout = 'both' | 'posts' | 'chat'

const KEY = 'sweet.layout'
const SPLIT_KEY = 'sweet.split'
const NAV_KEY = 'sweet.nav'
const NARROW = '(max-width: 799px)'

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
    // per-viewer convenience only
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

/**
 * Which panes are open, how wide the posts pane is, and whether the nav is
 * expanded. All persist per browser; on a narrow screen only one pane shows, so `both` resolves to chat.
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
  const [stored, setStored] = useState<Layout>(() => {
    const v = read(KEY)
    return v === 'both' || v === 'posts' || v === 'chat' ? v : 'both'
  })
  const [ratio, setRatioState] = useState<number>(() => {
    const v = Number(read(SPLIT_KEY))
    return v >= SPLIT_MIN && v <= SPLIT_MAX ? v : SPLIT_DEFAULT
  })
  const [navExpanded, setNavExpanded] = useState(() => read(NAV_KEY) === 'expanded')
  const narrow = useMediaQuery(NARROW)

  const setLayout = (l: Layout) => {
    setStored(l)
    write(KEY, l)
  }
  const setRatio = (r: number) => {
    setRatioState(r)
    write(SPLIT_KEY, String(r))
  }

  const toggleNav = () => {
    const next = !navExpanded
    setNavExpanded(next)
    write(NAV_KEY, next ? 'expanded' : 'collapsed')
  }

  const layout: Layout = narrow && stored === 'both' ? 'chat' : stored
  return { layout, narrow, ratio, navExpanded, setLayout, setRatio, toggleNav }
}
