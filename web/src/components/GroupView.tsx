import { useEffect } from 'react'
import type { Group, User } from '../api'
import { useUnreadPlaces } from '../data/hooks'
import { useLayout } from '../hooks/useLayout'
import { Rail, Split, Stack } from '../ui'
import { ChatPane } from './ChatPane'
import { PostsPane } from './PostsPane'

interface GroupViewProps {
  group: Group
  /** True while the view is behind another page. The view stays mounted so drafts are kept. */
  hidden: boolean
  /** The topic that the community's feed is filtered to (architecture.md, Topics). */
  topicId?: string | null
  /** A chat message to scroll to, from a notification. The chat pane is shown if it is hidden. */
  focusMessage?: string | null
  /** Called once the chat has shown the message, or could not find it. */
  onFocused?: () => void
}

/**
 * The label for a group in the nav and at the top of its view. A conversation
 * is labelled with the other user's name.
 */
export function groupLabel(g: Group, me: User): string {
  if (g.kind !== 'dm') return g.name
  return (g.members ?? []).find((u) => u.id !== me.id)?.username ?? 'Just you'
}

/**
 * A group's panes. When the group's mode is both, the posts and chat panes are
 * shown side by side, laid out exactly as for the root group. Otherwise one
 * pane takes the whole width. Home renders the bar above the panes (GroupBar),
 * because the bar stays mounted after the view unmounts.
 */
export function GroupView({ group, hidden, topicId = null, focusMessage = null, onFocused }: GroupViewProps) {
  const { layout, narrow, ratio, setLayout, setRatio } = useLayout()
  const both = group.mode === 'both'
  const show = layout === 'both' ? 'both' : layout === 'posts' ? 'left' : 'right'
  // A notification for a chat message opens the chat, on a phone in place of the posts.
  useEffect(() => {
    if (focusMessage && both && show === 'left') setLayout(narrow ? 'chat' : 'both')
  }, [focusMessage, both, show, narrow, setLayout])
  const rails = !narrow
  const unread = useUnreadPlaces().get(group.id)

  return (
    <Stack gap={0} fill hidden={hidden}>
      {both ? (
        <Split
          show={show}
          ratio={ratio}
          onRatio={setRatio}
          onCollapse={(side) => setLayout(side === 'left' ? 'chat' : 'posts')}
          leftRail={
            rails ? (
              <Rail
                side="left"
                icon="posts"
                label="Posts"
                dot={unread?.feed === true}
                onOpen={() => setLayout('both')}
              />
            ) : undefined
          }
          rightRail={
            rails ? (
              <Rail
                side="right"
                icon="chat"
                label="Chat"
                dot={unread?.chat === true}
                onOpen={() => setLayout('both')}
              />
            ) : undefined
          }
          left={
            <PostsPane
              groupId={group.id}
              side={show === 'both' ? 'left' : 'full'}
              watching={!hidden && show !== 'right'}
              topicId={topicId}
            />
          }
          right={
            <ChatPane
              groupId={group.id}
              side={show === 'both' ? 'right' : 'full'}
              watching={!hidden && show !== 'left'}
              focusMessage={focusMessage}
              onFocused={onFocused}
            />
          }
        />
      ) : group.mode === 'posts' ? (
        <PostsPane groupId={group.id} watching={!hidden} topicId={topicId} />
      ) : (
        <ChatPane groupId={group.id} watching={!hidden} focusMessage={focusMessage} onFocused={onFocused} />
      )}
    </Stack>
  )
}
