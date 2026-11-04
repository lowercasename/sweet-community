import { useState } from 'react'
import { logout, type User } from '../api'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import { ChatPane } from '../components/ChatPane'
import { MenuPage } from '../components/MenuPage'
import { PeoplePage } from '../components/PeoplePage'
import { PostsPane } from '../components/PostsPane'
import { SettingsPage } from '../components/SettingsPage'
import { Sidebar, type Page } from '../components/Sidebar'
import { Panes, Rail, Shell, Split, TabBar } from '../ui'

interface HomeProps {
  me: User
  onMeChange: (me: User) => void
  onSignOut: () => void
}

/**
 * The signed-in app: a nav column on the left, then the page. Home is posts
 * and chat either side of a draggable divider; drag a pane shut and it
 * folds into a Rail. On a narrow screen the nav column is replaced by a tab
 * bar at the bottom that also switches between the two panes.
 */
export function Home({ me, onMeChange, onSignOut }: HomeProps) {
  const { layout, narrow, ratio, navExpanded, setLayout, setRatio, toggleNav } = useLayout()
  const [page, setPage] = useState<Page>('home')

  const signOut = async () => {
    await logout()
    onSignOut()
  }

  let main
  if (page === 'people') main = <PeoplePage me={me} />
  else if (page === 'settings')
    main = <SettingsPage me={me} onMeChange={onMeChange} onSignOut={onSignOut} onLogout={() => void signOut()} />
  else if (page === 'menu') main = <MenuPage me={me} onNavigate={setPage} onLogout={() => void signOut()} />
  else if (narrow) main = <Panes layout="single">{layout === 'posts' ? <PostsPane me={me} /> : <ChatPane />}</Panes>
  else if (layout === 'both')
    main = (
      <Split
        ratio={ratio}
        onRatio={setRatio}
        onCollapse={(side) => setLayout(side === 'left' ? 'chat' : 'posts')}
        left={<PostsPane me={me} side="left" />}
        right={<ChatPane side="right" />}
      />
    )
  else if (layout === 'posts')
    main = (
      <Panes layout="right-rail">
        <PostsPane me={me} />
        <Rail side="right" icon="chat" label="Chat" onOpen={() => setLayout('both')} />
      </Panes>
    )
  else
    main = (
      <Panes layout="left-rail">
        <Rail side="left" icon="posts" label="Posts" onOpen={() => setLayout('both')} />
        <ChatPane />
      </Panes>
    )

  const tabActive = page === 'home' ? (layout === 'posts' ? 'posts' : 'chat') : page === 'menu' ? 'menu' : undefined

  return (
    <StreamProvider>
      <Shell
        aside={
          narrow ? undefined : (
            <Sidebar me={me} page={page} expanded={navExpanded} onNavigate={setPage} onToggle={toggleNav} />
          )
        }
      >
        {main}
        {narrow && (
          <TabBar
            tabs={[
              { key: 'posts', icon: 'posts', label: 'Posts' },
              { key: 'chat', icon: 'chat', label: 'Chat' },
              { key: 'search', icon: 'search', label: 'Search' },
              { key: 'bell', icon: 'bell', label: 'Alerts' },
              { key: 'menu', icon: 'menu', label: 'Menu' },
            ]}
            active={tabActive}
            onSelect={(key) => {
              if (key === 'posts' || key === 'chat') {
                setPage('home')
                setLayout(key)
              } else if (key === 'menu') setPage('menu')
              // Search and alerts come with their features.
            }}
          />
        )}
      </Shell>
    </StreamProvider>
  )
}
