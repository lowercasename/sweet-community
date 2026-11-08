import { useState } from 'react'
import { useLocation } from 'wouter'
import type { Member, User } from '../api'
import { useGroupActions, useMe, useUsers } from '../data/hooks'
import { groupPath, profilePath } from '../routes'
import { Alert, Avatar, Button, HoverCard, Row, Stack, Text, Time } from '../ui'

interface PersonNameProps {
  /** The user snapshot included in the content. The card shows the user's current data. */
  user: User
  /** The size of the avatar shown before the name, inside the same control, so hovering it also opens the card. */
  avatar?: 'xs' | 'sm' | 'md'
  /** For a comment's author. Shows a 20px avatar and a 15px name, one size smaller than a post's author. */
  small?: boolean
}

const ROLE_WORD: Record<Member['role'], string> = {
  owner: 'runs this community',
  moderator: 'moderator',
  member: '',
}

/**
 * The user card. It shows the user's current data, their role and join date,
 * and a Message button. The button is not shown on the viewer's own card or
 * for a user who is no longer on the instance.
 */
function PersonCard({ person, me }: { person: Member | User; me: User | null | undefined }) {
  const { openDM } = useGroupActions()
  const [, navigate] = useLocation()
  const [error, setError] = useState<string | null>(null)
  const standing = 'role' in person ? person : null
  const message = async () => {
    try {
      navigate(groupPath((await openDM(person.id)).id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a conversation')
    }
  }
  return (
    <Stack gap={2}>
      <Row gap={2} align="center">
        <Avatar name={person.username} picture={person.picture} size="lg" />
        <Stack gap={0}>
          <Text as="span" variant="name">
            {person.username}
          </Text>
          {standing && (
            <Text as="span" variant="small">
              {ROLE_WORD[standing.role] && `${ROLE_WORD[standing.role]} · `}joined <Time at={standing.joined_at} />
            </Text>
          )}
        </Stack>
      </Row>
      {error && <Alert tone="error">{error}</Alert>}
      {standing && (
        <Row gap={2}>
          <Button variant="secondary" icon="people" onClick={() => navigate(profilePath(person.username))}>
            View profile
          </Button>
          {me && me.id !== person.id && (
            <Button variant="secondary" icon="chat" onClick={() => void message()}>
              Message
            </Button>
          )}
        </Row>
      )}
    </Stack>
  )
}

/**
 * A user's name, wherever it is shown (architecture.md, Layout). It is a
 * control that opens a card about the user. The name and the card use the
 * users cache, so a new picture or name is shown at once. The snapshot
 * included in the content is the fallback.
 */
export function PersonName({ user, avatar, small = false }: PersonNameProps) {
  const { data: users } = useUsers()
  const { data: me } = useMe()
  const person = users?.get(user.id) ?? user
  return (
    <HoverCard name={person.username} card={<PersonCard person={person} me={me} />} small={small}>
      {avatar && <Avatar name={person.username} picture={person.picture} size={avatar} />}
      {person.username}
    </HoverCard>
  )
}
