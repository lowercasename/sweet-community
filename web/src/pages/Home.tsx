import { useEffect, useState } from 'react'
import { Redirect, Route, Switch, useLocation, useRoute, useSearch } from 'wouter'
import type { User } from '../api'
import {
  useAuthor,
  useGroupActions,
  useGroups,
  useRules,
  usePost,
  useTopics,
  useUnreadNotifications,
  useSettings,
  useUnreadPlaces,
} from '../data/hooks'
import { anyUnread } from '../data/notifications'
import { StreamProvider } from '../hooks/StreamContext'
import { useLayout } from '../hooks/useLayout'
import {
  COMMUNITY,
  CONVERSATIONS,
  NEW_CONVERSATION,
  NEW_ROOM,
  NOTIFICATIONS,
  RULES,
  SEARCH,
  groupPath,
  membersPath,
  profilePath,
} from '../routes'
import { CommunityPage } from '../components/CommunityPage'
import { GroupView, groupLabel } from '../components/GroupView'
import { InstallPrompt } from '../components/InstallPrompt'
import { MembersPage } from '../components/MembersPage'
import { MenuPage } from '../components/MenuPage'
import { MessagesPage } from '../components/MessagesPage'
import { NewGroupPage } from '../components/NewGroupPage'
import { NewMessagePage } from '../components/NewMessagePage'
import { NotificationsPage } from '../components/NotificationsPage'
import { PageBar } from '../components/PageBar'
import { PeoplePage } from '../components/PeoplePage'
import { PostPage } from '../components/PostPage'
import { ProfilePage } from '../components/ProfilePage'
import { RulesPage } from '../components/RulesPage'
import { SearchPage } from '../components/SearchPage'
import { SettingsPage } from '../components/SettingsPage'
import { Welcome } from '../components/Welcome'
import { Sidebar } from '../components/Sidebar'
import { Button, ConfirmDialog, Menu, Segmented, Shell, TabBar, Text } from '../ui'

/** What the bar calls each page that is not a place. */
const PAGE_TITLES: Record<string, string> = {
  [CONVERSATIONS]: 'Conversations',
  [NEW_CONVERSATION]: 'New conversation',
  [NEW_ROOM]: 'New room',
  [NOTIFICATIONS]: 'Notifications',
  [SEARCH]: 'Search',
  '/people': 'People',
  '/settings': 'Settings',
  [COMMUNITY]: 'Community',
  [RULES]: 'Rules',
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
  const [atGroup, groupParams] = useRoute('/r/:id')
  const [atMembers, membersParams] = useRoute('/r/:id/members')
  const [atPost, postParams] = useRoute('/p/:id')
  const [atProfile, profileParams] = useRoute('/u/:name')
  // The words searched for live in the URL, and so does the topic Home is showing (architecture.md, Topics).
  const search = new URLSearchParams(useSearch())
  const searched = search.get('q') ?? ''
  const atRoot = location === '/'
  const topicId = atRoot ? search.get('topic') : null
  // The chat message to scroll to, from a notification (architecture.md, Notifications).
  const focusMessage = search.get('message')
  const { topics, loading: topicsLoading } = useTopics()
  const { settings } = useSettings()
  const rules = useRules()
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
  const tabActive = atRoot
    ? 'home'
    : location === '/menu'
      ? 'menu'
      : location === NOTIFICATIONS
        ? 'bell'
        : location === SEARCH
          ? 'search'
          : undefined
  const postAuthor = useAuthor(openPost?.author ?? me)
  // Hiding a conversation (architecture.md, Groups): from its bar's menu, after a word of confirmation.
  const groupActions = useGroupActions()
  const [hiding, setHiding] = useState(false)
  const [busy, setBusy] = useState(false)
  const hide = async () => {
    if (!current) return
    setBusy(true)
    try {
      await groupActions.leave(current.id, me.id)
      setHiding(false)
      navigate(CONVERSATIONS)
    } finally {
      setBusy(false)
    }
  }

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
          : atProfile
            ? { title: decodeURIComponent(profileParams.name) }
            : location === RULES
              ? narrow
                ? { title: 'Rules', back: { label: 'Back to menu', onClick: () => navigate('/menu') } }
                : { title: 'Rules', back: { label: 'Back to Home', onClick: () => navigate('/') } }
              : location === '/settings'
                ? {
                    title: 'Settings',
                    back: { label: `Back to ${me.username}`, onClick: () => navigate(profilePath(me.username)) },
                  }
                : { title: PAGE_TITLES[location] ?? 'Home' }

  // A group the URL names that is not mine (or is gone) does not exist to me. A topic that is gone is everything.
  if (!loading && named && !groups.some((g) => g.id === named)) return <Redirect to="/" replace />
  if (topicId && !topicsLoading && !topics.some((t) => t.id === topicId)) return <Redirect to="/" replace />
  // A conversation has no members page: it is two people, named in its bar.
  if (atMembers && current?.kind === 'dm') return <Redirect to={groupPath(current.id)} replace />

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
        {/* The phone's menu is the one view under no bar: it is not a place to be named. */}
        {location !== '/menu' && (
          <PageBar title={bar.title} back={bar.back}>
            {narrow && viewing && current?.mode === 'both' && (
              <Segmented
                label="View"
                segments={[
                  {
                    key: 'posts',
                    icon: 'posts',
                    label: 'Posts',
                    tour: 'view-posts',
                    dot: layout !== 'posts' && places.get(current.id)?.feed === true,
                  },
                  {
                    key: 'chat',
                    icon: 'chat',
                    label: 'Chat',
                    tour: 'view-chat',
                    dot: layout !== 'chat' && places.get(current.id)?.chat === true,
                  },
                ]}
                value={layout === 'posts' ? 'posts' : 'chat'}
                compact
                onChange={setLayout}
              />
            )}
            {/* The community's rules, when it has some (architecture.md, Admin tools). On the phone they are in the menu. */}
            {atRoot && rules && !narrow && (
              <Button variant="ghost" icon="rules" label="Rules" tour="rules" onClick={() => navigate(RULES)}>
                Rules
              </Button>
            )}
            {viewing && current && current.kind === 'group' && (
              <Button
                variant="ghost"
                icon="people"
                label="Members and settings"
                onClick={() => navigate(membersPath(current))}
              >
                {narrow ? undefined : 'Members and settings'}
              </Button>
            )}
            {viewing && current && current.kind === 'dm' && (
              <Menu
                label="Conversation options"
                items={[{ label: 'Hide conversation', icon: 'remove', onSelect: () => setHiding(true) }]}
              />
            )}
          </PageBar>
        )}
        {/* The offer to add the community to the home screen shows on Home only, so it never covers another page. */}
        {atRoot && <InstallPrompt name={settings?.name || 'Sweet'} />}
        <Switch>
          <Route path="/people">
            {root && <PeoplePage me={me} root={root} onOpenGroup={(id) => navigate(groupPath(id, root.id))} />}
          </Route>
          <Route path="/settings">{root && <SettingsPage me={me} root={root} onSignOut={onSignOut} />}</Route>
          <Route path={COMMUNITY}>
            {root &&
              (root.can.manage_instance || root.can.manage_topics ? (
                <CommunityPage root={root} editing={search.get('edit') === 'welcome' ? 'welcome' : undefined} />
              ) : (
                <Redirect to="/" replace />
              ))}
          </Route>
          <Route path={RULES}>
            <RulesPage />
          </Route>
          <Route path={SEARCH}>
            <SearchPage key={searched} query={searched} groups={groups} onGo={navigate} />
          </Route>
          <Route path={NOTIFICATIONS}>
            <NotificationsPage groups={groups} onGo={navigate} />
          </Route>
          <Route path={CONVERSATIONS}>
            <MessagesPage me={me} onGo={navigate} />
          </Route>
          <Route path={NEW_CONVERSATION}>
            <NewMessagePage me={me} onOpened={(g) => navigate(groupPath(g.id, root?.id))} />
          </Route>
          <Route path="/menu">
            <MenuPage me={me} groups={groups} onGo={navigate} onLogout={onSignOut} />
          </Route>
          <Route path={NEW_ROOM}>
            <NewGroupPage onCreated={(g) => navigate(groupPath(g.id, root?.id))} />
          </Route>
          <Route path="/r/:id/members">
            {atMembers && current && current.id === membersParams.id && (
              <MembersPage key={current.id} group={current} me={me} onLeft={() => navigate('/')} />
            )}
          </Route>
          <Route path="/u/:name">
            {atProfile && (
              <ProfilePage
                key={profileParams.name}
                name={decodeURIComponent(profileParams.name)}
                me={me}
                onGo={navigate}
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
        {current && (
          <GroupView
            key={current.id}
            group={current}
            hidden={!viewing}
            topicId={topicId}
            focusMessage={viewing ? focusMessage : null}
            onFocused={() => navigate(location, { replace: true })}
          />
        )}
        {/* The welcome dialog and the tour (architecture.md, New-instance lifecycle). Settings asks for it with ?welcome. */}
        {root && (
          <Welcome
            root={root}
            atHome={atRoot}
            asked={atRoot && search.has('welcome')}
            onClosed={() => {
              if (search.has('welcome')) navigate('/', { replace: true })
            }}
          />
        )}
        <ConfirmDialog
          open={hiding}
          title="Hide this conversation?"
          confirmLabel="Hide"
          busy={busy}
          onConfirm={() => void hide()}
          onClose={() => setHiding(false)}
        >
          <Text variant="secondary">
            You can bring it back from All conversations. The other person will not be notified.
          </Text>
        </ConfirmDialog>
        {narrow && (
          <TabBar
            tabs={[
              { key: 'home', icon: 'home', label: 'Home', dot: !atRoot && !!root && anyUnread(places.get(root.id)) },
              { key: 'search', icon: 'search', label: 'Search' },
              { key: 'bell', icon: 'bell', label: 'Notifications', dot: unread },
              { key: 'menu', icon: 'menu', label: 'Menu', tour: 'menu' },
            ]}
            active={tabActive}
            onSelect={(key) => {
              if (key === 'home') navigate('/')
              else if (key === 'menu') navigate('/menu')
              else if (key === 'bell') navigate(NOTIFICATIONS)
              else if (key === 'search') navigate(SEARCH)
            }}
          />
        )}
      </Shell>
    </StreamProvider>
  )
}
