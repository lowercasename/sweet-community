import { useEffect, useState } from 'react'
import { getMe, type User } from '../api'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import { ChatPane } from '../components/ChatPane'
import { PostsPane } from '../components/PostsPane'
import { Sidebar } from '../components/Sidebar'
import { Panes, Rail, Shell, Split, TabBar } from '../ui'

/**
 * The one page: a nav column on the left, then posts and chat either side of
 * a draggable divider. Drag a pane shut and it folds into a Rail; click the
 * rail to bring it back. On a narrow screen one pane shows and a tab bar at
 * the bottom switches.
 */
export function Home() {
  const [me, setMe] = useState<User | null>(null)
  const { layout, narrow, ratio, navExpanded, setLayout, setRatio, toggleNav } = useLayout()

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
            { key: 'posts', icon: 'posts', label: 'Posts' },
            { key: 'chat', icon: 'chat', label: 'Chat' },
            { key: 'search', icon: 'search', label: 'Search' },
            { key: 'bell', icon: 'bell', label: 'Alerts' },
            { key: 'menu', icon: 'menu', label: 'Menu' },
          ]}
          active={layout === 'posts' ? 'posts' : 'chat'}
          onSelect={(key) => {
            // Only the panes do anything yet; search, alerts and the menu sheet come with their features.
            if (key === 'posts' || key === 'chat') setLayout(key)
          }}
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

  return (
    <StreamProvider>
      <Shell aside={narrow ? undefined : <Sidebar me={me} expanded={navExpanded} onToggle={toggleNav} />}>{body}</Shell>
    </StreamProvider>
  )
}
