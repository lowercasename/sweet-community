import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createMessage, getMessages, type Message as MessageData } from '../api'
import { useStreamEvents, useStreamStatus } from '../hooks/StreamContext'
import { Bar, Button, Card, Pane, Row, ScrollArea, Stack, Text } from '../ui'
import { ChatInput } from './ChatInput'
import { ConnectionStatus } from './ConnectionStatus'
import { MessageGroup } from './MessageGroup'

interface ChatPaneProps {
  /** Which outer edge is padded; `left`/`right` inside a Split. */
  side?: 'left' | 'right' | 'full'
}

const GROUP_WINDOW_MS = 5 * 60_000
const STICK_THRESHOLD_PX = 80

function isMessage(data: unknown): data is MessageData {
  return typeof data === 'object' && data !== null && typeof (data as MessageData).id === 'string'
}

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

/** Oldest first; ignores duplicates by id. */
function append(list: MessageData[], m: MessageData): MessageData[] {
  if (list.some((x) => x.id === m.id)) return list
  return [...list, m].sort((a, b) => a.created_at - b.created_at)
}

export function ChatPane({ side = 'full' }: ChatPaneProps) {
  const status = useStreamStatus()
  const [messages, setMessages] = useState<MessageData[]>([])
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  // Follow new messages only while the viewer is already at the bottom.
  const stickRef = useRef(true)
  // Height before an older page was prepended, so the view doesn't jump.
  const prependRef = useRef<number | null>(null)

  useStreamEvents((kind, data) => {
    if (kind === 'message' && isMessage(data)) setMessages((prev) => append(prev, data))
  })

  useEffect(() => {
    let cancelled = false
    getMessages()
      .then((page) => {
        if (cancelled) return
        setMessages((prev) => page.messages.reduceRight((acc, m) => append(acc, m), prev))
        setNextBefore(page.next_before)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
  }

  const loadEarlier = async () => {
    if (nextBefore == null || loading) return
    setLoading(true)
    setLoadError(null)
    try {
      const page = await getMessages(nextBefore)
      prependRef.current = scrollRef.current?.scrollHeight ?? null
      setMessages((prev) => page.messages.reduceRight((acc, m) => append(acc, m), prev))
      setNextBefore(page.next_before)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load')
    } finally {
      setLoading(false)
    }
  }

  const send = async (bodyHtml: string) => {
    const m = await createMessage(bodyHtml)
    stickRef.current = true // your own message always scrolls into view
    setMessages((prev) => append(prev, m))
  }

  return (
    <Pane side={side} flush>
      <Card fill flush>
        <ScrollArea ref={scrollRef} pad="inner" onScroll={onScroll}>
          <Stack gap={3}>
            {nextBefore != null && (
              <Row>
                <Button variant="secondary" disabled={loading} onClick={() => void loadEarlier()}>
                  {loading ? 'Loading…' : 'Load earlier'}
                </Button>
              </Row>
            )}
            {loadError && <Text variant="secondary">{loadError}</Text>}
            {!loading && messages.length === 0 && (
              <Text variant="secondary">Nobody has said anything yet. Say hello.</Text>
            )}
            {group(messages).map((run) => (
              <MessageGroup key={run[0].id} messages={run} />
            ))}
          </Stack>
        </ScrollArea>
        <Bar as="footer" edge="footer">
          <Stack gap={1}>
            <ConnectionStatus status={status} />
            <ChatInput disabled={status === 'offline'} onSend={send} />
          </Stack>
        </Bar>
      </Card>
    </Pane>
  )
}
