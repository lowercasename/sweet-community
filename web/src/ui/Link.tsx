import type { ReactNode } from 'react'
import styles from './Link.module.css'

interface LinkProps {
  href: string
  children?: ReactNode
}

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(window.location.origin)
}

/** Underlined anchor. External links open in a new tab with rel noopener noreferrer. */
export function Link({ href, children }: LinkProps) {
  const external = isExternal(href)
  return (
    <a
      className={styles.link}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  )
}
