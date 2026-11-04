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
import { Rail, Shell, Split, TabBar } from '../ui'

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
 *
 * Posts and chat stay mounted whatever is showing, so a half-written post
 * or message survives closing its pane or visiting Settings.
 */
export function Home({ me, onMeChange, onSignOut }: HomeProps) {
  const { layout, narrow, ratio, navExpanded, setLayout, setRatio, toggleNav } = useLayout()
  const [page, setPage] = useState<Page>('home')

  const signOut = async () => {
    await logout()
    onSignOut()
  }

  const show = layout === 'both' ? 'both' : layout === 'posts' ? 'left' : 'right'
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
        {page === 'people' && <PeoplePage me={me} />}
        {page === 'settings' && (
          <SettingsPage me={me} onMeChange={onMeChange} onSignOut={onSignOut} onLogout={() => void signOut()} />
        )}
        {page === 'menu' && <MenuPage me={me} onNavigate={setPage} onLogout={() => void signOut()} />}
        <Split
          hidden={page !== 'home'}
          show={show}
          ratio={ratio}
          onRatio={setRatio}
          onCollapse={(side) => setLayout(side === 'left' ? 'chat' : 'posts')}
          leftRail={narrow ? undefined : <Rail side="left" icon="posts" label="Posts" onOpen={() => setLayout('both')} />}
          rightRail={narrow ? undefined : <Rail side="right" icon="chat" label="Chat" onOpen={() => setLayout('both')} />}
          left={<PostsPane me={me} side={show === 'both' ? 'left' : 'full'} />}
          right={<ChatPane side={show === 'both' ? 'right' : 'full'} />}
        />
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
