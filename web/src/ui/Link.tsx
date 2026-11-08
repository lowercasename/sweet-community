import type { ReactNode } from 'react'
import { Link as Route } from 'wouter'

interface LinkProps {
  /** A path in the app or an external address. */
  href?: string
  /** For navigation that changes the page's state instead of the route, such as Back to sign in. Rendered as a button. */
  onClick?: () => void
  children?: ReactNode
}

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(window.location.origin)
}

const CLASS = 'text-sky underline-offset-2 hover:text-sweet hover:underline'

/**
 * A sky-blue anchor that turns Sweet red on hover. An external link opens in
 * a new tab. A path in the app is a real anchor, so it can be copied or opened
 * in a new tab, and wouter routes it without a page load.
 */
export function Link({ href, onClick, children }: LinkProps) {
  if (href === undefined) {
    return (
      <button
        type="button"
        className={`${CLASS} cursor-pointer appearance-none border-0 bg-transparent p-0 font-[inherit] text-[inherit]`}
        onClick={onClick}
      >
        {children}
      </button>
    )
  }
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
