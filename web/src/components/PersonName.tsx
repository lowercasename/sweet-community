import { useState } from 'react'
import { useLocation } from 'wouter'
import type { Member, User } from '../api'
import { useGroupActions, useMe, useUsers } from '../data/hooks'
import { groupPath } from '../routes'
import { Avatar, Button, HoverCard, Row, Stack, Text, Time } from '../ui'

interface PersonNameProps {
  /** The person as the content carried them; the card shows them as they are now. */
  user: User
  /** Their picture before the name, inside the same control, so hovering it opens the card too. */
  avatar?: 'sm' | 'md'
}

const ROLE_WORD: Record<Member['role'], string> = {
  owner: 'runs this place',
  moderator: 'moderator',
  member: '',
}

/** The card: who they are now, their standing here, and a way to message them (not myself). */
function PersonCard({ person, me }: { person: Member | User; me: User | null | undefined }) {
  const { openDM } = useGroupActions()
  const [, navigate] = useLocation()
  const [error, setError] = useState<string | null>(null)
  const standing = 'role' in person ? person : null
  const message = async () => {
    try {
      navigate(groupPath((await openDM([person.id])).id))
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
      {error && <Text variant="secondary">{error}</Text>}
      {me && me.id !== person.id && (
        <Row>
          <Button variant="secondary" icon="chat" onClick={() => void message()}>
            Message
          </Button>
        </Row>
      )}
    </Stack>
  )
}

/**
 * A person's name wherever it is written (architecture.md, Layout): a
 * control that opens a card about them. The name and the card come from
 * the users cache, so a new picture or name shows here at once; the
 * snapshot the content carried is the fallback.
 */
export function PersonName({ user, avatar }: PersonNameProps) {
  const { data: users } = useUsers()
  const { data: me } = useMe()
  const person = users?.get(user.id) ?? user
  return (
    <HoverCard name={person.username} card={<PersonCard person={person} me={me} />}>
      {avatar && <Avatar name={person.username} picture={person.picture} size={avatar} />}
      {person.username}
    </HoverCard>
  )
}
