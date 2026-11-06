import type { ReactNode } from 'react'
import { Link as Route } from 'wouter'

interface LinkProps {
  href: string
  children?: ReactNode
}

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(window.location.origin)
}

const CLASS = 'text-sky underline-offset-2 hover:text-sweet hover:underline'

/**
 * Sky-blue anchor that turns Sweet red on hover. External links open in a
 * new tab; a path in the app is a real anchor (copy it, open it in a new
 * tab) that wouter routes without a page load.
 */
export function Link({ href, children }: LinkProps) {
  if (isExternal(href)) {
    return (
      <a className={CLASS} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return (
    <Route href={href} className={CLASS}>
      {children}
    </Route>
  )
}
