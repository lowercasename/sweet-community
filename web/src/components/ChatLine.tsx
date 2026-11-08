import type { Message } from '../api'
import { useAuthor } from '../data/hooks'
import { ChatNote } from '../ui'

/**
 * A joined or added line in a chat (architecture.md, Chat). It is centred light text, apart from the messages. It
 * uses the users cache, so a changed name shows at once.
 */
export function ChatLine({ line }: { line: Message }) {
  const author = useAuthor(line.author)
  const subject = useAuthor(line.subject ?? line.author)
  return (
    <ChatNote>
      {line.kind === 'joined'
        ? `${author.username} joined the community`
        : `${author.username} added ${subject.username} to the room`}
    </ChatNote>
  )
}
