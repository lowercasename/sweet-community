import { useState } from 'react'
import type { User } from '../api'
import { useGroups } from '../data/hooks'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import { GroupView } from '../components/GroupView'
import { MembersPage } from '../components/MembersPage'
import { MenuPage } from '../components/MenuPage'
import { NewGroupPage } from '../components/NewGroupPage'
import { PeoplePage } from '../components/PeoplePage'
import { SettingsPage } from '../components/SettingsPage'
import { Sidebar, type Page } from '../components/Sidebar'
import { Shell, TabBar } from '../ui'

interface HomeProps {
  me: User
  /** Ends the session (this one, or all of them) and returns to the sign-in page. */
  onSignOut: () => void
}

/**
 * The signed-in app: a nav column on the left, then the page. The page is
 * one group's view (the root group is Home), or People, Settings, a group's
 * members, or the new-group form. On a narrow screen the nav column is
 * replaced by a tab bar at the bottom.
 *
 * The current group's panes stay mounted whatever page is showing, so a
 * half-written post or message survives a visit to Settings or Members.
 * Switching to another group swaps them.
 */
export function Home({ me, onSignOut }: HomeProps) {
  const { layout, narrow, navExpanded, setLayout, toggleNav } = useLayout()
  const { groups } = useGroups()
  const root = groups.find((g) => g.kind === 'root')
  const [page, setPage] = useState<Page>('home')
  const [groupId, setGroupId] = useState<string | null>(null)

  const current = groups.find((g) => g.id === (groupId ?? root?.id)) ?? root
  const openGroup = (id: string) => {
    setGroupId(id)
    setPage('home')
  }
  const tabActive = page === 'home' ? (layout === 'posts' ? 'posts' : 'chat') : page === 'menu' ? 'menu' : undefined

  return (
    <StreamProvider>
      <Shell
        aside={
          narrow ? undefined : (
            <Sidebar
              me={me}
              groups={groups}
              currentGroupId={page === 'home' ? current?.id : undefined}
              page={page}
              expanded={navExpanded}
              onNavigate={setPage}
              onOpenGroup={openGroup}
              onToggle={toggleNav}
            />
          )
        }
      >
        {page === 'people' && root && <PeoplePage me={me} root={root} onOpenGroup={openGroup} />}
        {page === 'settings' && root && <SettingsPage me={me} root={root} onSignOut={onSignOut} />}
        {page === 'menu' && (
          <MenuPage me={me} groups={groups} onNavigate={setPage} onOpenGroup={openGroup} onLogout={onSignOut} />
        )}
        {page === 'new-group' && <NewGroupPage onCreated={(g) => openGroup(g.id)} />}
        {page === 'members' && current && (
          <MembersPage
            key={current.id}
            group={current}
            me={me}
            onLeft={() => {
              setGroupId(null)
              setPage('home')
            }}
          />
        )}
        {current && (
          <GroupView
            key={current.id}
            group={current}
            me={me}
            hidden={page !== 'home'}
            onMembers={() => setPage('members')}
          />
        )}
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
