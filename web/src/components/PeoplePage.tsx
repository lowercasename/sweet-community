import { useState } from 'react'
import type { Invite, Me, Member } from '../api'
import { useInviteActions, useInvites, useSetRole, useUsers } from '../data/hooks'
import {
  Avatar,
  Button,
  Card,
  Heading,
  Input,
  List,
  ListItem,
  Measure,
  Pane,
  Row,
  ScrollArea,
  Stack,
  Text,
  Time,
} from '../ui'

interface PeoplePageProps {
  me: Me
}

function InviteRow({ invite, onRevoke }: { invite: Invite; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = window.location.origin + invite.url
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (http, permissions); the field is selectable
    }
  }
  return (
    <Stack gap={1}>
      <Row gap={2} align="center">
        <Input value={url} readOnly selectOnFocus />
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="ghost" onClick={onRevoke}>
          Revoke
        </Button>
      </Row>
      <Text variant="small">
        Expires <Time at={invite.expires_at} />
      </Text>
    </Stack>
  )
}

const ROLE_WORD: Record<Member['role'], string> = {
  owner: 'runs this place',
  moderator: 'moderator',
  member: '',
}

/**
 * Everyone on the instance. Staff mint invite links here; the owner sets
 * roles. Both are the server's call, read from me.can.
 */
export function PeoplePage({ me }: PeoplePageProps) {
  const { data: users } = useUsers()
  const { invites, error: inviteError } = useInvites(me.can.invite)
  const { create, revoke } = useInviteActions()
  const setRole = useSetRole()
  const [error, setError] = useState<string | null>(null)

  const invite = async () => {
    try {
      await create()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite')
    }
  }
  const change = async (u: Member) => {
    try {
      await setRole(u.id, u.role === 'moderator' ? 'member' : 'moderator')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the role')
    }
  }

  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            {me.can.invite && (
              <Card>
                <Stack gap={2}>
                  <Heading level={2}>Invite someone</Heading>
                  <Text variant="secondary">A link works once and for seven days. Send it however you like.</Text>
                  <Row>
                    <Button onClick={() => void invite()}>Create invite link</Button>
                  </Row>
                  {inviteError && <Text variant="secondary">{inviteError.message}</Text>}
                  {invites.map((inv) => (
                    <InviteRow key={inv.code} invite={inv} onRevoke={() => void revoke(inv.code)} />
                  ))}
                </Stack>
              </Card>
            )}
            <Card>
              <Stack gap={2}>
                <Heading level={2}>People</Heading>
                {error && <Text variant="secondary">{error}</Text>}
                <List>
                  {[...(users?.values() ?? [])].map((u) => (
                    <ListItem key={u.id}>
                      <Row justify="between" align="center">
                        <Row gap={2} align="center">
                          <Avatar name={u.username} picture={u.picture} />
                          <Text as="span" variant="name">
                            {u.username}
                          </Text>
                          <Text as="span" variant="small">
                            {ROLE_WORD[u.role] && `${ROLE_WORD[u.role]} · `}joined <Time at={u.created_at} />
                          </Text>
                        </Row>
                        {me.can.manage_roles && u.role !== 'owner' && u.id !== me.id && (
                          <Button variant="ghost" onClick={() => void change(u)}>
                            {u.role === 'moderator' ? 'Make member' : 'Make moderator'}
                          </Button>
                        )}
                      </Row>
                    </ListItem>
                  ))}
                </List>
              </Stack>
            </Card>
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
