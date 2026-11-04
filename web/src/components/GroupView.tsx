import type { Group, User } from '../api'
import { useLayout } from '../hooks/useLayout'
import { Button, Heading, Rail, Row, Split, Stack } from '../ui'
import { ChatPane } from './ChatPane'
import { PostsPane } from './PostsPane'

interface GroupViewProps {
  group: Group
  me: User
  /** Hidden behind another page, but kept mounted so drafts survive. */
  hidden: boolean
  onMembers: () => void
}

/** What to call a group in the nav and at the top of its view: a DM is its other people. */
export function groupLabel(g: Group, me: User): string {
  if (g.kind !== 'dm') return g.name
  const others = (g.members ?? []).filter((u) => u.id !== me.id).map((u) => u.username)
  return others.length > 0 ? others.join(', ') : 'Just you'
}

/**
 * A group's panes: posts and chat side by side when its mode is both, drawn
 * exactly as the root group is; one pane across the whole width otherwise.
 * The root group has no bar; every other group shows its name and a way to
 * its members.
 */
export function GroupView({ group, me, hidden, onMembers }: GroupViewProps) {
  const { layout, narrow, ratio, setLayout, setRatio } = useLayout()
  const both = group.mode === 'both'
  const show = layout === 'both' ? 'both' : layout === 'posts' ? 'left' : 'right'
  const rails = !narrow

  return (
    <Stack gap={0} fill hidden={hidden}>
      {group.kind !== 'root' && (
        <Row justify="between" align="center" pad>
          <Heading level={2}>{groupLabel(group, me)}</Heading>
          <Button variant="ghost" icon="people" onClick={onMembers}>
            Members
          </Button>
        </Row>
      )}
      {both ? (
        <Split
          show={show}
          ratio={ratio}
          onRatio={setRatio}
          onCollapse={(side) => setLayout(side === 'left' ? 'chat' : 'posts')}
          leftRail={
            rails ? <Rail side="left" icon="posts" label="Posts" onOpen={() => setLayout('both')} /> : undefined
          }
          rightRail={
            rails ? <Rail side="right" icon="chat" label="Chat" onOpen={() => setLayout('both')} /> : undefined
          }
          left={<PostsPane groupId={group.id} side={show === 'both' ? 'left' : 'full'} />}
          right={<ChatPane groupId={group.id} side={show === 'both' ? 'right' : 'full'} />}
        />
      ) : group.mode === 'posts' ? (
        <PostsPane groupId={group.id} />
      ) : (
        <ChatPane groupId={group.id} />
      )}
    </Stack>
  )
}
