import { useEffect, useState } from 'react'
import { Redirect, Route, Switch, useLocation, useRoute, useSearch } from 'wouter'
import type { User } from '../api'
import { useChatUnread, useGroups, usePost, useUnreadNotifications } from '../data/hooks'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import { MESSAGES, NEW_MESSAGE, NEW_ROOM, NOTIFICATIONS, groupPath, membersPath } from '../routes'
import { GroupBar } from '../components/GroupBar'
import { GroupView } from '../components/GroupView'
import { MembersPage } from '../components/MembersPage'
import { MenuPage } from '../components/MenuPage'
import { MessagesPage } from '../components/MessagesPage'
import { NewGroupPage } from '../components/NewGroupPage'
import { NewMessagePage } from '../components/NewMessagePage'
import { NotificationsPage } from '../components/NotificationsPage'
import { PeoplePage } from '../components/PeoplePage'
import { PostPage } from '../components/PostPage'
import { SettingsPage } from '../components/SettingsPage'
import { Sidebar } from '../components/Sidebar'
import { Shell, TabBar } from '../ui'

interface HomeProps {
  me: User
  /** Ends the session (this one, or all of them) and returns to the sign-in page. */
  onSignOut: () => void
}

/**
 * The signed-in app: a nav column on the left, then the page the URL names
 * (architecture.md, Layout). `/` and `/r/<id>` are a group's view (a DM's
 * too); the other pages show over it, a post's page over its room. The last group the URL named stays mounted behind
 * them, so a half-written post or message survives a visit to Settings or
 * Members; naming another group swaps it.
 */
export function Home({ me, onSignOut }: HomeProps) {
  const { layout, narrow, navExpanded, setLayout, toggleNav } = useLayout()
  const { groups, loading } = useGroups()
  const unread = useUnreadNotifications()
  const counts = useChatUnread()
  const root = groups.find((g) => g.kind === 'root')
  const [location, navigate] = useLocation()
  // New message starts from the people a conversation's page sends it (?with=ids).
  const withPeople = (new URLSearchParams(useSearch()).get('with') ?? '').split(',').filter(Boolean)
  const [atGroup, groupParams] = useRoute('/r/:id')
  const [atMembers, membersParams] = useRoute('/r/:id/members')
  const [atPost, postParams] = useRoute('/p/:id')
  const atRoot = location === '/'
  // A post's page sits over the room the post is in, once the post is known.
  const { post: openPost } = usePost(postParams?.id ?? '', atPost)

  // The group the URL names, if any; else the last one it named, so its panes stay put.
  const named = atRoot ? root?.id : (groupParams?.id ?? membersParams?.id ?? (atPost ? openPost?.group_id : undefined))
  const [last, setLast] = useState<string | undefined>()
  useEffect(() => {
    if (named) setLast(named)
  }, [named])
  const current = groups.find((g) => g.id === (named ?? last)) ?? root
  const viewing = atRoot || atGroup
  const tabActive = viewing
    ? layout === 'posts'
      ? 'posts'
      : 'chat'
    : location === '/menu'
      ? 'menu'
      : location === NOTIFICATIONS
        ? 'bell'
        : undefined

  // A group the URL names that is not mine (or is gone) does not exist to me.
  if (!loading && named && !groups.some((g) => g.id === named)) return <Redirect to="/" replace />

  return (
    <StreamProvider>
      <Shell
        aside={
          narrow ? undefined : (
            <Sidebar
              me={me}
              groups={groups}
              location={location}
              expanded={navExpanded}
              onGo={navigate}
              onToggle={toggleNav}
            />
          )
        }
      >
        {current && current.kind !== 'root' && (viewing || atMembers) && (
          <GroupBar
            group={current}
            me={me}
            onBack={atMembers ? () => navigate(groupPath(current.id, root?.id)) : undefined}
            onMembers={viewing ? () => navigate(membersPath(current)) : undefined}
          />
        )}
        <Switch>
          <Route path="/people">
            {root && <PeoplePage me={me} root={root} onOpenGroup={(id) => navigate(groupPath(id, root.id))} />}
          </Route>
          <Route path="/settings">{root && <SettingsPage me={me} root={root} onSignOut={onSignOut} />}</Route>
          <Route path={NOTIFICATIONS}>
            <NotificationsPage groups={groups} onGo={navigate} />
          </Route>
          <Route path="/messages">
            <MessagesPage me={me} onGo={navigate} />
          </Route>
          <Route path={NEW_MESSAGE}>
            <NewMessagePage me={me} initial={withPeople} onOpened={(g) => navigate(groupPath(g.id, root?.id))} />
          </Route>
          <Route path="/menu">
            <MenuPage me={me} groups={groups} onGo={navigate} onLogout={onSignOut} />
          </Route>
          <Route path={NEW_ROOM}>
            <NewGroupPage onCreated={(g) => navigate(groupPath(g.id, root?.id))} />
          </Route>
          <Route path="/r/:id/members">
            {atMembers && current && current.id === membersParams.id && (
              <MembersPage
                key={current.id}
                group={current}
                me={me}
                onLeft={() => navigate(current.kind === 'dm' ? MESSAGES : '/')}
                onStartWith={(ids) => navigate(`${NEW_MESSAGE}?with=${ids.map(encodeURIComponent).join(',')}`)}
              />
            )}
          </Route>
          <Route path="/p/:id">
            {atPost && <PostPage key={postParams.id} postId={postParams.id} groups={groups} onGo={navigate} />}
          </Route>
          <Route path="/" />
          <Route path="/r/:id" />
          <Route>
            <Redirect to="/" replace />
          </Route>
        </Switch>
        {current && <GroupView key={current.id} group={current} hidden={!viewing} />}
        {narrow && (
          <TabBar
            tabs={[
              { key: 'posts', icon: 'posts', label: 'Posts' },
              {
                key: 'chat',
                icon: 'chat',
                label: 'Chat',
                dot: tabActive !== 'chat' && !!current && (counts.get(current.id) ?? 0) > 0,
              },
              { key: 'search', icon: 'search', label: 'Search' },
              { key: 'bell', icon: 'bell', label: 'Notifications', dot: unread },
              { key: 'menu', icon: 'menu', label: 'Menu' },
            ]}
            active={tabActive}
            onSelect={(key) => {
              if (key === 'posts' || key === 'chat') {
                if (current) navigate(groupPath(current.id, root?.id))
                setLayout(key)
              } else if (key === 'menu') navigate('/menu')
              else if (key === 'bell') navigate(NOTIFICATIONS)
              // Search comes with its feature.
            }}
          />
        )}
      </Shell>
    </StreamProvider>
  )
}
