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
  /** The group whose room this is. */
  groupId: string
  /** Which outer edge is padded; `left`/`right` inside a Split. */
  side?: 'left' | 'right' | 'full'
  /** Being looked at: open, and not behind another page. Looking is reading. */
  watching: boolean
}

const GROUP_WINDOW_MS = 5 * 60_000
const STICK_THRESHOLD_PX = 80

/** Runs of messages by one person within GROUP_WINDOW_MS of the previous one. */
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

/** A chat marks itself read this long after the last message it showed, so a busy room is one PUT. */
const READ_DEBOUNCE_MS = 800

export function ChatPane({ groupId, side = 'full', watching }: ChatPaneProps) {
  const status = useStreamStatus()
  const { messages, loading, error, hasEarlier, loadEarlier } = useMessages(groupId)
  const { send: sendMessage, remove } = useMessageActions(groupId)

  // Looking is reading (architecture.md, Notifications): while watched and
  // the page is in front, my marker on this chat follows its newest message.
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
  // Follow new messages only while the viewer is already at the bottom.
  const stickRef = useRef(true)
  // Height before an older page was prepended, so the view doesn't jump.
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
    if (!el || el.clientHeight === 0) return // hidden: nothing to measure
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
    topRef.current = el.scrollTop
  }

  // The pane is hidden (display: none) while closed or behind another page,
  // which loses the browser's scroll position. When it gets a size again,
  // or the divider changes its width, put the view back: at the bottom if it
  // was following, else where it was.
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
    stickRef.current = true // your own message always scrolls into view
    await sendMessage(bodyHtml)
  }

  return (
    <Pane side={side} flush>
      <Card fill flush>
        <ScrollArea ref={scrollRef} pad="inner" onScroll={onScroll}>
          <Stack gap={3}>
            {hasEarlier && (
              <Row>
                <Button variant="secondary" disabled={loading} onClick={() => void earlier()}>
                  {loading ? 'Loading…' : 'Load earlier'}
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
              extensions={chatExtensions}
              size="line"
              enterSubmits
              images="attached"
              submitLabel="Send"
              busyLabel="Sending…"
              disabled={status === 'offline'}
              onSubmit={send}
            />
          </Stack>
        </Bar>
      </Card>
    </Pane>
  )
}
