import { Button } from './Button'

interface ReplyQuoteProps {
  /** The original's author, or undefined once the original is deleted. */
  author?: string
  text: string
  deleted: boolean
  /** Scrolls to the original. Not offered once the original is deleted. */
  onClick?: () => void
}

/**
 * The snippet of the message a reply answers, above the reply's body (architecture.md, Chat): a red rule on the left
 * and one line of text, "kit: the first line of their message". It scrolls to the original when clicked. Once the
 * original is deleted it says so and does nothing.
 */
export function ReplyQuote({ author, text, deleted, onClick }: ReplyQuoteProps) {
  if (deleted) {
    return <div className="border-l-2 border-line pl-2 text-sm text-mute italic">Message deleted</div>
  }
  const shown = text || 'An image'
  return (
    <button
      type="button"
      aria-label={`${author}: ${shown}`}
      className="block w-full min-w-0 cursor-pointer appearance-none truncate border-0 border-l-2 border-sweet bg-transparent py-0 pr-0 pl-2 text-left font-[inherit] text-sm text-mute hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-pink"
      onClick={onClick}
    >
      <span className="font-medium text-sweet">{author}</span>: {shown}
    </button>
  )
}

interface ReplyStripProps {
  author: string
  text: string
  onCancel: () => void
}

/**
 * The message being replied to, attached above the chat editor until the reply is sent or cancelled. One line of
 * text, "Replying to kit: the first line of their message", cut with an ellipsis when it is too long.
 */
export function ReplyStrip({ author, text, onCancel }: ReplyStripProps) {
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-[4px] border border-line bg-field py-0.5 pr-0.5 pl-3 text-sm">
      <span className="min-w-0 flex-1 truncate text-mute">
        Replying to <span className="font-medium text-sweet">{author}</span>: {text || 'An image'}
      </span>
      <Button variant="ghost" icon="remove" label="Cancel reply" compact onClick={onCancel} />
    </div>
  )
}
