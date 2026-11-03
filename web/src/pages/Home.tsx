import { useEffect, useState } from 'react'
import { getMe, type User } from '../api'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import { ChatPane } from '../components/ChatPane'
import { Header } from '../components/Header'
import { PostsPane } from '../components/PostsPane'
import { Button, Panes } from '../ui'

/**
 * The one page: posts on the left, chat on the right. Either pane can be
 * closed; on a narrow screen only one shows and the header switches.
 */
export function Home() {
  const [me, setMe] = useState<User | null>(null)
  const { layout, narrow, setLayout } = useLayout()

  useEffect(() => {
    getMe().then(setMe).catch(() => setMe(null))
  }, [])

  const showPosts = layout !== 'chat'
  const showChat = layout !== 'posts'
  const split = showPosts && showChat

  // Wide: a hidden pane can be shown again. Narrow: the header switches panes.
  const actions = narrow ? (
    <Button variant="quiet" onClick={() => setLayout(showChat ? 'posts' : 'chat')}>
      {showChat ? 'Posts' : 'Chat'}
    </Button>
  ) : (
    <>
      {!showPosts && (
        <Button variant="quiet" onClick={() => setLayout('both')}>
          Show posts
        </Button>
      )}
      {!showChat && (
        <Button variant="quiet" onClick={() => setLayout('both')}>
          Show chat
        </Button>
      )}
    </>
  )

  return (
    <StreamProvider>
      <Header username={me?.username ?? null} actions={actions} />
      <Panes split={split}>
        {showPosts && <PostsPane me={me} onClose={split ? () => setLayout('chat') : undefined} />}
        {showChat && <ChatPane onClose={split ? () => setLayout('posts') : undefined} />}
      </Panes>
    </StreamProvider>
  )
}
