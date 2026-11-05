import { useState } from 'react'
import type { Group, Invite, Member, User } from '../api'
import { useGroupActions, useInviteActions, useInvites, useSetRole, useUsers } from '../data/hooks'
import { Button, Card, Heading, Input, List, ListItem, Measure, Pane, Row, ScrollArea, Stack, Text, Time } from '../ui'
import { PersonName } from './PersonName'

interface PeoplePageProps {
  me: User
  /** The instance as a group: its can flags say whether I invite and set roles. */
  root: Group
  /** Show a group's view: after starting a DM with someone. */
  onOpenGroup: (id: string) => void
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
 * Everyone on the instance: the root group's members. Its staff mint invite
 * links here; its owner sets roles. Both come from the root group's can flags.
 */
export function PeoplePage({ me, root, onOpenGroup }: PeoplePageProps) {
  const { data: users } = useUsers()
  const { openDM } = useGroupActions()
  const { invites, error: inviteError } = useInvites(root.can.add_members)
  const { create, revoke } = useInviteActions()
  const setRole = useSetRole(root.id)
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
  const message = async (u: Member) => {
    try {
      onOpenGroup((await openDM([u.id])).id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a conversation')
    }
  }

  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            {root.can.add_members && (
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
                      <Row justify="between" align="center" wrap="narrow">
                        <Row gap={2} align="center">
                          <PersonName user={u} avatar="md" />
                          <Text as="span" variant="small">
                            {ROLE_WORD[u.role] && `${ROLE_WORD[u.role]} · `}joined <Time at={u.joined_at} />
                          </Text>
                        </Row>
                        <Row gap={1} align="center" shrink={false}>
                          {u.id !== me.id && (
                            <Button variant="ghost" icon="chat" onClick={() => void message(u)}>
                              Message
                            </Button>
                          )}
                          {root.can.set_roles && u.role !== 'owner' && u.id !== me.id && (
                            <Button variant="ghost" onClick={() => void change(u)}>
                              {u.role === 'moderator' ? 'Make member' : 'Make moderator'}
                            </Button>
                          )}
                        </Row>
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
