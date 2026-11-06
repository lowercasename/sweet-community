import { useState } from 'react'
import type { Group, Invite, Member, User } from '../api'
import { useGroupActions, useInviteActions, useInvites, useRemoveUser, useSetRole, useUsers } from '../data/hooks'
import {
  Button,
  Card,
  ConfirmDialog,
  Heading,
  Input,
  List,
  ListItem,
  Measure,
  Menu,
  type MenuItem,
  Pane,
  Row,
  ScrollArea,
  Stack,
  Text,
  Time,
} from '../ui'
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
  const removeUser = useRemoveUser()
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)

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
  // Who may be removed is the server's call, on each person (architecture.md, Admin tools).
  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await removeUser(removing.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove them')
    } finally {
      setBusy(false)
      setRemoving(null)
    }
  }
  const message = async (u: Member) => {
    try {
      onOpenGroup((await openDM([u.id])).id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a conversation')
    }
  }

  // Staff's doings to one person, behind a three-dot menu on their row; Message stays in the open.
  const items = (u: Member): MenuItem[] => {
    const out: MenuItem[] = []
    if (root.can.set_roles && u.role !== 'owner')
      out.push({
        label: u.role === 'moderator' ? 'Make member' : 'Make moderator',
        onSelect: () => void change(u),
      })
    if (u.can.remove) out.push({ label: 'Remove', icon: 'remove', onSelect: () => setRemoving(u) })
    return out
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
                          {u.id !== me.id && items(u).length > 0 && (
                            <Menu label={`Options for ${u.username}`} items={items(u)} />
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
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${removing.username} from this place?` : ''}
        confirmLabel={busy ? 'Removing…' : 'Remove'}
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      >
        <Text variant="secondary">
          Their posts, comments and messages stay, under a removed name. Rooms they own pass to their longest-serving
          moderator, or member. They cannot sign in again. This cannot be undone.
        </Text>
      </ConfirmDialog>
    </Pane>
  )
}
