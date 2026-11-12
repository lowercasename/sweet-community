import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Message as MessageData } from '../api'
import { useGroups, useMarkRead, useMarkers, useMessageActions, useMessages } from '../data/hooks'
import { chatStream, markerOf } from '../data/notifications'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStreamStatus } from '../hooks/StreamContext'
import { Alert, Bar, Button, Card, DayDivider, Pane, ReplyStrip, Row, ScrollArea, Stack } from '../ui'
import { sameDay } from '../ui/Time'
import { chatExtensions } from '../editor/extensions'
import { BodyEditor } from './BodyEditor'
import { ChatLine } from './ChatLine'
import { MessageGroup } from './MessageGroup'

interface ChatPaneProps {
  /** The group whose chat this pane shows. */
  groupId: string
  /** Which outer edge is padded. `left` or `right` is used inside a Split. */
  side?: 'left' | 'right' | 'full'
  /** True while the pane is open and not behind another page. A visible pane marks its chat as read. */
  watching: boolean
  /** A message to scroll to and highlight, from a notification. Earlier pages are loaded until it is found. */
  focusMessage?: string | null
  /** Called once the message has been shown, or when it cannot be found. */
  onFocused?: () => void
}

const GROUP_WINDOW_MS = 15 * 60_000
const STICK_THRESHOLD_PX = 80

/** Splits messages into runs by one user, each message within GROUP_WINDOW_MS of the previous one. */
function group(list: MessageData[]): MessageData[][] {
  const groups: MessageData[][] = []
  for (const m of list) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    // A joined or added line stands alone, so the messages on either side of it start separate runs.
    if (
      prev &&
      m.kind === 'message' &&
      prev.kind === 'message' &&
      prev.author.id === m.author.id &&
      m.created_at - prev.created_at <= GROUP_WINDOW_MS &&
      sameDay(m.created_at, prev.created_at)
    )
      last.push(m)
    else groups.push([m])
  }
  return groups
}

/** The delay after the last shown message before the chat is marked read, so a busy chat sends one PUT. */
const READ_DEBOUNCE_MS = 800

export function ChatPane({ groupId, side = 'full', watching, focusMessage = null, onFocused }: ChatPaneProps) {
  const status = useStreamStatus()
  const { messages, loading, error, hasEarlier, loadEarlier } = useMessages(groupId)
  const { send: sendMessage, remove } = useMessageActions(groupId)
  // In a conversation, the report dialog says that moderators will see the reported message.
  const conversation = useGroups().groups.find((g) => g.id === groupId)?.kind === 'dm'

  // A visible chat is marked read. While the
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

  // The message being replied to, attached above the editor until the reply is sent or cancelled.
  const [replying, setReplying] = useState<MessageData | null>(null)
  // The message a clicked quote scrolled to, highlighted briefly.
  const [highlight, setHighlight] = useState<string | null>(null)
  const send = async (bodyHtml: string) => {
    stickRef.current = true // The user's own message always scrolls into view.
    await sendMessage(bodyHtml, replying?.id)
    setReplying(null)
  }
  // Scrolls to a message, if it is loaded, and highlights it for a moment. The view stops following new
  // messages first. Otherwise the re-render for the highlight scrolled back to the bottom, and the quote
  // needed several clicks.
  const jump = (id: string): boolean => {
    const el = document.getElementById(`message-${id}`)
    if (!el) return false
    stickRef.current = false
    el.scrollIntoView({ block: 'center' })
    setHighlight(id)
    window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1500)
    return true
  }
  // A message a clicked quote names. It is set only when the message is not loaded yet.
  const [seeking, setSeeking] = useState<string | null>(null)
  const quoted = (id: string) => {
    if (!jump(id)) setSeeking(id)
  }
  // Shows the message that a notification or a quote names. Earlier pages load until the message is found. When
  // no earlier pages are left, the message is not in the chat, and the search stops.
  const target = focusMessage ?? seeking
  useEffect(() => {
    if (!target || loading) return
    if (!jump(target) && hasEarlier) {
      void earlier()
      return
    }
    if (target === focusMessage) onFocused?.()
    else setSeeking(null)
    // jump and earlier are recreated each render, and only these values decide whether to act again.
  }, [target, loading, hasEarlier, messages.length])

  const runs = group(messages)
  return (
    <Pane side={side} flush tour="chat">
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
            {runs.map((run, index) => (
              <Fragment key={run[0].id}>
                {(index === 0 || !sameDay(run[0].created_at, runs[index - 1][0].created_at)) && (
                  <DayDivider at={run[0].created_at} />
                )}
                {run[0].kind === 'message' ? (
                  <MessageGroup
                    messages={run}
                    onDelete={remove}
                    onReply={setReplying}
                    onJump={quoted}
                    highlight={highlight}
                    conversation={conversation}
                  />
                ) : (
                  <ChatLine line={run[0]} />
                )}
              </Fragment>
            ))}
          </Stack>
        </ScrollArea>
        <Bar as="footer" edge="footer">
          <BodyEditor
            groupId={groupId}
            extensions={chatExtensions}
            size="line"
            enterSubmits
            images="attached"
            submitLabel="Send"
            disabled={status === 'offline'}
            onSubmit={send}
            draft={`message:${groupId}`}
            head={
              replying && (
                <ReplyStrip
                  author={replying.author.username}
                  text={replying.body_text}
                  onCancel={() => setReplying(null)}
                />
              )
            }
            onEscape={replying ? () => setReplying(null) : undefined}
            focus={replying?.id}
          />
        </Bar>
      </Card>
    </Pane>
  )
}
