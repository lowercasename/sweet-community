import { useEffect, useState } from 'react'
import { getMe, type User } from '../api'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import { ChatPane } from '../components/ChatPane'
import { PostsPane } from '../components/PostsPane'
import { Panes, Rail, Split, TabBar } from '../ui'

/**
 * The one page, no header: posts on the left, chat on the right, a draggable
 * divider between them. Drag a pane shut and it folds into a Rail; click the
 * rail to bring it back. On a narrow screen one pane shows and a tab bar at
 * the bottom switches.
 */
export function Home() {
  const [me, setMe] = useState<User | null>(null)
  const { layout, narrow, ratio, setLayout, setRatio } = useLayout()

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
  }, [])

  let body
  if (narrow) {
    body = (
      <>
        <Panes layout="single">{layout === 'posts' ? <PostsPane me={me} /> : <ChatPane />}</Panes>
        <TabBar
          tabs={[
            { key: 'posts', label: 'Posts' },
            { key: 'chat', label: 'Chat' },
          ]}
          active={layout === 'posts' ? 'posts' : 'chat'}
          onSelect={setLayout}
        />
      </>
    )
  } else if (layout === 'both') {
    body = (
      <Split
        ratio={ratio}
        onRatio={setRatio}
        onCollapse={(side) => setLayout(side === 'left' ? 'chat' : 'posts')}
        left={<PostsPane me={me} side="left" />}
        right={<ChatPane side="right" />}
      />
    )
  } else if (layout === 'posts') {
    body = (
      <Panes layout="right-rail">
        <PostsPane me={me} />
        <Rail side="right" label="Chat" onOpen={() => setLayout('both')} />
      </Panes>
    )
  } else {
    body = (
      <Panes layout="left-rail">
        <Rail side="left" label="Posts" onOpen={() => setLayout('both')} />
        <ChatPane />
      </Panes>
    )
  }

  return <StreamProvider>{body}</StreamProvider>
}
