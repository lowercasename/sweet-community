import { useEffect, useState } from 'react'
import { Redirect, Route, Switch, useLocation, useRoute, useSearch } from 'wouter'
import type { User } from '../api'
import { useAuthor, useGroups, usePost, useUnreadNotifications, useUnreadPlaces } from '../data/hooks'
import { anyUnread } from '../data/notifications'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import { MESSAGES, NEW_MESSAGE, NEW_ROOM, NOTIFICATIONS, groupPath, membersPath } from '../routes'
import { GroupView, groupLabel } from '../components/GroupView'
import { MembersPage } from '../components/MembersPage'
import { MenuPage } from '../components/MenuPage'
import { MessagesPage } from '../components/MessagesPage'
import { NewGroupPage } from '../components/NewGroupPage'
import { NewMessagePage } from '../components/NewMessagePage'
import { NotificationsPage } from '../components/NotificationsPage'
import { PageBar } from '../components/PageBar'
import { PeoplePage } from '../components/PeoplePage'
import { PostPage } from '../components/PostPage'
import { SettingsPage } from '../components/SettingsPage'
import { Sidebar } from '../components/Sidebar'
import { Button, Segmented, Shell, TabBar } from '../ui'

/** What the bar calls each page that is not a place. */
const PAGE_TITLES: Record<string, string> = {
  [MESSAGES]: 'Messages',
  [NEW_MESSAGE]: 'New message',
  [NEW_ROOM]: 'New room',
  [NOTIFICATIONS]: 'Notifications',
  '/people': 'People',
  '/settings': 'Settings',
  '/menu': 'Menu',
}

interface HomeProps {
  me: User
  /** Ends the session (this one, or all of them) and returns to the sign-in page. */
  onSignOut: () => void
}

/**
 * The signed-in app: a nav column on the left, then the page the URL names
 * (architecture.md, Layout), under a bar that names it. `/` and `/r/<id>`
 * are a group's view (a DM's too); the other pages show over it, a post's
 * page over its room. The last group the URL named stays mounted behind
 * them, so a half-written post or message survives a visit to Settings or
 * Members; naming another group swaps it.
 */
export function Home({ me, onSignOut }: HomeProps) {
  const { layout, narrow, navExpanded, setLayout, toggleNav } = useLayout()
  const { groups, loading } = useGroups()
  const unread = useUnreadNotifications()
  const places = useUnreadPlaces()
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
  const tabActive = atRoot ? 'home' : location === '/menu' ? 'menu' : location === NOTIFICATIONS ? 'bell' : undefined
  const postAuthor = useAuthor(openPost?.author ?? me)

  // The bar names the view; under something, it leads back to it.
  const label = current ? groupLabel(current, me) : ''
  const place = !current || current.kind === 'root' ? 'Home' : label
  const toPlace = () => navigate(current ? groupPath(current.id, root?.id) : '/')
  const bar = atRoot
    ? { title: 'Home' }
    : atGroup
      ? { title: label }
      : atMembers
        ? { title: label, back: { label: `Back to ${place}`, onClick: toPlace } }
        : atPost
          ? openPost
            ? { title: `Post by ${postAuthor.username}`, back: { label: `Back to ${place}`, onClick: toPlace } }
            : { title: 'Post' }
          : { title: PAGE_TITLES[location] ?? 'Home' }

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
        <PageBar title={bar.title} back={bar.back}>
          {narrow && viewing && current?.mode === 'both' && (
            <Segmented
              label="View"
              segments={[
                {
                  key: 'posts',
                  icon: 'posts',
                  label: 'Posts',
                  dot: layout !== 'posts' && places.get(current.id)?.feed === true,
                },
                {
                  key: 'chat',
                  icon: 'chat',
                  label: 'Chat',
                  dot: layout !== 'chat' && places.get(current.id)?.chat === true,
                },
              ]}
              value={layout === 'posts' ? 'posts' : 'chat'}
              compact
              onChange={setLayout}
            />
          )}
          {viewing && current && current.kind !== 'root' && (
            <Button
              variant="ghost"
              icon="people"
              label={current.kind === 'dm' ? `${(current.members ?? []).length} people` : 'Members and settings'}
              onClick={() => navigate(membersPath(current))}
            >
              {narrow
                ? undefined
                : current.kind === 'dm'
                  ? `${(current.members ?? []).length} people`
                  : 'Members and settings'}
            </Button>
          )}
        </PageBar>
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
              { key: 'home', icon: 'home', label: 'Home', dot: !atRoot && !!root && anyUnread(places.get(root.id)) },
              { key: 'search', icon: 'search', label: 'Search' },
              { key: 'bell', icon: 'bell', label: 'Notifications', dot: unread },
              { key: 'menu', icon: 'menu', label: 'Menu' },
            ]}
            active={tabActive}
            onSelect={(key) => {
              if (key === 'home') navigate('/')
              else if (key === 'menu') navigate('/menu')
              else if (key === 'bell') navigate(NOTIFICATIONS)
              // Search comes with its feature.
            }}
          />
        )}
      </Shell>
    </StreamProvider>
  )
}
