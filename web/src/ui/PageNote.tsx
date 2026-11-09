import type { ReactNode } from 'react'
import { Text } from './Text'

/**
 * A line of small text above a page's cards, such as the Community page's note on what the shield means. It is
 * inset by a card's padding, so it lines up with the text inside the cards.
 */
export function PageNote({ children }: { children?: ReactNode }) {
  return (
    <div className="px-4">
      <Text variant="small">{children}</Text>
    </div>
  )
}
