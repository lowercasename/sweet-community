import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Message as MessageData } from '../api'
import { useMarkRead, useMarkers, useMessageActions, useMessages } from '../data/hooks'
import { chatStream, markerOf } from '../data/notifications'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStreamStatus } from '../hooks/StreamContext'
import { Alert, Bar, Button, Card, Pane, Row, ScrollArea, Stack } from '../ui'
import { chatExtensions } from '../editor/extensions'
import { BodyEditor } from './BodyEditor'
import { ConnectionStatus } from './ConnectionStatus'
import { MessageGroup } from './MessageGroup'

interface ChatPaneProps {
  /** The group whose chat this pane shows. */
  groupId: string
  /** Which outer edge is padded. `left` or `right` is used inside a Split. */
  side?: 'left' | 'right' | 'full'
  /** True while the pane is open and not behind another page. A visible pane marks its chat as read. */
  watching: boolean
}

const GROUP_WINDOW_MS = 5 * 60_000
const STICK_THRESHOLD_PX = 80

/** Splits messages into runs by one user, each message within GROUP_WINDOW_MS of the previous one. */
function group(list: MessageData[]): MessageData[][] {
  const groups: MessageData[][] = []
  for (const m of list) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    if (prev && prev.author.id === m.author.id && m.created_at - prev.created_at < GROUP_WINDOW_MS) last.push(m)
    else groups.push([m])
  }
  return groups
}

/** The delay after the last shown message before the chat is marked read, so a busy chat sends one PUT. */
const READ_DEBOUNCE_MS = 800

export function ChatPane({ groupId, side = 'full', watching }: ChatPaneProps) {
  const status = useStreamStatus()
  const { messages, loading, error, hasEarlier, loadEarlier } = useMessages(groupId)
  const { send: sendMessage, remove } = useMessageActions(groupId)

  // A visible chat is marked read (architecture.md, Notifications). While the
  // pane is watched and the page is in the foreground, the user's read marker
  // on this chat moves to its newest message.
  const { markers, loaded } = useMarkers()
  const markRead = useMarkRead()
  const visible = usePageVisible()
  const newest = messages[messages.length - 1]?.created_at
  const readAt = markerOf(markers, chatStream(groupId))
  useEffect(() => {
    if (!watching || !visible || !loaded || newest === undefined) return
    if (newest > (readAt ?? 0)) markRead(chatStream(groupId), newest, READ_DEBOUNCE_MS)
  }, [watching, visible, loaded, newest, readAt, groupId, markRead])

  const scrollRef = useRef<HTMLDivElement>(null)
  // Scroll to new messages only while the user is already at the bottom.
  const stickRef = useRef(true)
  // The scroll height before an older page was prepended, used to keep the view from jumping.
  const prependRef = useRef<number | null>(null)
  // Last known scroll position, restored after the pane was hidden.
  const topRef = useRef(0)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prependRef.current != null) {
      el.scrollTop += el.scrollHeight - prependRef.current
      prependRef.current = null
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el || el.clientHeight === 0) return // The pane is hidden, so there is nothing to measure.
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
    topRef.current = el.scrollTop
  }

  // The pane is hidden with display: none while closed or behind another
  // page, and the browser loses its scroll position. When the pane has a size
  // again, or the divider changes its width, restore the view. Scroll to the
  // bottom if the view was following new messages, otherwise to the saved
  // position.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (el.clientHeight === 0) return
      el.scrollTop = stickRef.current ? el.scrollHeight : topRef.current
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const earlier = async () => {
    prependRef.current = scrollRef.current?.scrollHeight ?? null
    await loadEarlier()
  }

  const send = async (bodyHtml: string) => {
    stickRef.current = true // The user's own message always scrolls into view.
    await sendMessage(bodyHtml)
  }

  return (
    <Pane side={side} flush>
      <Card fill flush>
        <ScrollArea ref={scrollRef} pad="inner" onScroll={onScroll}>
          <Stack gap={3}>
            {hasEarlier && (
              <Row>
                <Button variant="secondary" busy={loading} onClick={() => void earlier()}>
                  Load earlier
                </Button>
              </Row>
            )}
            {error && <Alert tone="error">{error.message}</Alert>}
            {!loading && messages.length === 0 && <Alert>Nobody has said anything yet. Say hello.</Alert>}
            {group(messages).map((run) => (
              <MessageGroup key={run[0].id} messages={run} onDelete={remove} />
            ))}
          </Stack>
        </ScrollArea>
        <Bar as="footer" edge="footer">
          <Stack gap={1}>
            <ConnectionStatus status={status} />
            <BodyEditor
              groupId={groupId}
              extensions={chatExtensions}
              size="line"
              enterSubmits
              images="attached"
              submitLabel="Send"
              disabled={status === 'offline'}
              onSubmit={send}
            />
          </Stack>
        </Bar>
      </Card>
    </Pane>
  )
}
