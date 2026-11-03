import type { ReactNode } from 'react'

interface LinkProps {
  href: string
  children?: ReactNode
}

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(window.location.origin)
}

/** Sky-blue anchor that turns Sweet red on hover. External links open in a new tab. */
export function Link({ href, children }: LinkProps) {
  const external = isExternal(href)
  return (
    <a
      className="text-sky underline-offset-2 hover:text-sweet hover:underline"
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  )
}
