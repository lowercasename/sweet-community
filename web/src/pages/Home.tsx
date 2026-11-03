import { useEffect, useState } from 'react'
import { getMe, type User } from '../api'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import { ChatPane } from '../components/ChatPane'
import { Header } from '../components/Header'
import { PostsPane } from '../components/PostsPane'
import { Button, Panes, Rail, Row, type PanesLayout } from '../ui'

/**
 * The one page: posts on the left, chat on the right. Either pane can be
 * collapsed; on a narrow screen only one shows and the header switches.
 *
 * Two shell treatments are in here while we choose (localStorage sweet.ui):
 *   rails  – a collapse button at each pane's outer corner; a collapsed pane
 *            becomes a thin vertical rail that reopens it.
 *   header – panel toggles in the header; a collapsed pane just disappears.
 */
export function Home() {
  const [me, setMe] = useState<User | null>(null)
  const { layout, narrow, ui, setLayout } = useLayout()

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
  }, [])

  const showPosts = layout !== 'chat'
  const showChat = layout !== 'posts'

  // Narrow: a two-way switch in the header, whichever shell.
  const narrowActions = (
    <Row gap={0} align="center">
      <Button variant="ghost" icon="posts" pressed={showPosts} onClick={() => setLayout('posts')}>
        Posts
      </Button>
      <Button variant="ghost" icon="chat" pressed={showChat} onClick={() => setLayout('chat')}>
        Chat
      </Button>
    </Row>
  )

  // Wide, header shell: two panel toggles.
  const headerActions = (
    <Row gap={0} align="center">
      <Button
        variant="ghost"
        icon="panel-left"
        label={showPosts ? 'Hide posts' : 'Show posts'}
        pressed={showPosts}
        onClick={() => setLayout(showPosts ? 'chat' : 'both')}
      />
      <Button
        variant="ghost"
        icon="panel-right"
        label={showChat ? 'Hide chat' : 'Show chat'}
        pressed={showChat}
        onClick={() => setLayout(showChat ? 'posts' : 'both')}
      />
    </Row>
  )

  const rails = ui === 'rails' && !narrow
  let panesLayout: PanesLayout = 'single'
  if (showPosts && showChat) panesLayout = 'split'
  else if (rails) panesLayout = showPosts ? 'right-rail' : 'left-rail'

  return (
    <StreamProvider>
      <Header
        username={me?.username ?? null}
        actions={narrow ? narrowActions : ui === 'header' ? headerActions : undefined}
      />
      <Panes layout={panesLayout}>
        {showPosts ? (
          <PostsPane me={me} onCollapse={rails && showChat ? () => setLayout('chat') : undefined} />
        ) : (
          rails && <Rail side="left" label="Posts" onOpen={() => setLayout('both')} />
        )}
        {showChat ? (
          <ChatPane onCollapse={rails && showPosts ? () => setLayout('posts') : undefined} />
        ) : (
          rails && <Rail side="right" label="Chat" onOpen={() => setLayout('both')} />
        )}
      </Panes>
    </StreamProvider>
  )
}
