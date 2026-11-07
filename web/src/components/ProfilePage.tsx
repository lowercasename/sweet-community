import { useState } from 'react'
import type { Post as PostData, Profile, User } from '../api'
import { useGroupActions, useGroups, usePostActions, useProfile, useSetBio, useUserPosts } from '../data/hooks'
import { useStreamStatus } from '../hooks/StreamContext'
import { commentExtensions } from '../editor/extensions'
import { groupPath } from '../routes'
import { Alert, Avatar, Button, Card, Heading, Measure, Pane, Row, ScrollArea, Stack, Text, Time } from '../ui'
import { Body } from './Body'
import { BodyEditor } from './BodyEditor'
import { Post } from './Post'

interface ProfilePageProps {
  name: string
  me: User
  onGo: (path: string) => void
}

const ROLE_WORD: Record<Profile['role'], string> = {
  owner: 'Runs this community',
  moderator: 'Moderator',
  member: '',
}

/**
 * A person's page at /u/<name> (architecture.md, Accounts): their picture,
 * name, standing and joining, a bio they alone edit, a way to message them,
 * and their posts from the rooms I share with them, newest first. No chat:
 * that is a conversation. My own page is where Settings is reached from.
 */
export function ProfilePage({ name, me, onGo }: ProfilePageProps) {
  const { profile, loading, error } = useProfile(name)
  if (profile) return <Loaded profile={profile} me={me} onGo={onGo} />
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            {loading && !error ? (
              <Text variant="secondary">Loading…</Text>
            ) : (
              <Stack gap={2}>
                <Text variant="secondary">There is nobody here by that name.</Text>
                <Row>
                  <Button variant="secondary" icon="people" onClick={() => onGo('/people')}>
                    People
                  </Button>
                </Row>
              </Stack>
            )}
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}

function Loaded({ profile, me, onGo }: { profile: Profile; me: User; onGo: (path: string) => void }) {
  const { posts, loading, error, hasMore, loadMore } = useUserPosts(profile.username)
  const { groups } = useGroups()
  const { openDM } = useGroupActions()
  const setBio = useSetBio()
  const status = useStreamStatus()
  const [editing, setEditing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const offline = status === 'offline'
  const placeOf = (p: PostData) => {
    const g = groups.find((x) => x.id === p.group_id)
    return !g || g.kind === 'root' ? undefined : { id: g.id, name: g.name, picture: g.picture }
  }
  const message = async () => {
    try {
      onGo(groupPath((await openDM(profile.id)).id))
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not open a conversation')
    }
  }
  const saveBio = async (html: string) => {
    await setBio(html)
    setEditing(false)
  }
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            <Card>
              <Stack gap={2}>
                <Row gap={3} align="center">
                  <Avatar name={profile.username} picture={profile.picture} size="lg" />
                  <Stack gap={0}>
                    <Heading level={2}>{profile.username}</Heading>
                    <Text as="span" variant="small">
                      {ROLE_WORD[profile.role] && `${ROLE_WORD[profile.role]} · `}joined <Time at={profile.joined_at} />
                    </Text>
                  </Stack>
                </Row>
                {editing ? (
                  <BodyEditor
                    extensions={commentExtensions}
                    size="line"
                    placeholder="A few words about yourself…"
                    submitLabel="Save"
                    busyLabel="Saving…"
                    initialHtml={profile.bio_html}
                    disabled={offline}
                    allowEmpty
                    onSubmit={saveBio}
                    onCancel={() => setEditing(false)}
                  />
                ) : profile.bio_html ? (
                  <Body html={profile.bio_html} />
                ) : profile.can.edit ? (
                  <Text variant="secondary">Nothing about you yet.</Text>
                ) : null}
                {problem && <Alert tone="error">{problem}</Alert>}
                <Row gap={2}>
                  {profile.can.edit && !editing && (
                    <Button variant="secondary" icon="pencil" disabled={offline} onClick={() => setEditing(true)}>
                      {profile.bio_html ? 'Edit bio' : 'Write a bio'}
                    </Button>
                  )}
                  {profile.can.edit && (
                    <Button variant="secondary" icon="settings" onClick={() => onGo('/settings')}>
                      Settings
                    </Button>
                  )}
                  {!profile.can.edit && (
                    <Button variant="secondary" icon="chat" onClick={() => void message()}>
                      Message
                    </Button>
                  )}
                </Row>
              </Stack>
            </Card>
            <Stack gap={3}>
              <Heading level={3}>Posts</Heading>
              {error && <Alert tone="error">{error.message}</Alert>}
              {!loading && posts.length === 0 && (
                <Text variant="secondary">{profile.id === me.id ? 'You have not posted yet.' : 'No posts yet.'}</Text>
              )}
              {posts.map((p) => (
                <AuthorPost key={p.id} post={p} place={placeOf(p)} disabled={offline} />
              ))}
              {hasMore && (
                <Row>
                  <Button variant="secondary" disabled={loading} onClick={loadMore}>
                    {loading ? 'Loading…' : 'Load more'}
                  </Button>
                </Row>
              )}
            </Stack>
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}

/** One of the person's posts, with the actions for its own room. */
function AuthorPost({
  post,
  place,
  disabled,
}: {
  post: PostData
  place?: { id: string; name: string; picture?: string | null }
  disabled: boolean
}) {
  const { edit, remove } = usePostActions(post.group_id)
  return (
    <Post
      post={post}
      place={place}
      disabled={disabled}
      onEdit={(html) => edit(post.id, html)}
      onDelete={() => remove(post.id)}
    />
  )
}
