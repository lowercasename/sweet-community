import type { Group, User } from '../api'
import { useUnreadPlaces } from '../data/hooks'
import { useLayout } from '../hooks/useLayout'
import { Rail, Split, Stack } from '../ui'
import { ChatPane } from './ChatPane'
import { PostsPane } from './PostsPane'

interface GroupViewProps {
  group: Group
  /** Hidden behind another page, but kept mounted so drafts survive. */
  hidden: boolean
}

/** What to call a group in the nav and at the top of its view: a conversation is its other person. */
export function groupLabel(g: Group, me: User): string {
  if (g.kind !== 'dm') return g.name
  return (g.members ?? []).find((u) => u.id !== me.id)?.username ?? 'Just you'
}

/**
 * A group's panes: posts and chat side by side when its mode is both, drawn
 * exactly as the root group is; one pane across the whole width otherwise.
 * The bar above them (GroupBar) is Home's, since it outlives the view.
 */
export function GroupView({ group, hidden }: GroupViewProps) {
  const { layout, narrow, ratio, setLayout, setRatio } = useLayout()
  const both = group.mode === 'both'
  const show = layout === 'both' ? 'both' : layout === 'posts' ? 'left' : 'right'
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
            />
          }
          right={
            <ChatPane
              groupId={group.id}
              side={show === 'both' ? 'right' : 'full'}
              watching={!hidden && show !== 'left'}
            />
          }
        />
      ) : group.mode === 'posts' ? (
        <PostsPane groupId={group.id} watching={!hidden} />
      ) : (
        <ChatPane groupId={group.id} watching={!hidden} />
      )}
    </Stack>
  )
}
