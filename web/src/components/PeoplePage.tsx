import { useState } from 'react'
import type { Group, Invite, Member, User } from '../api'
import { useGroupActions, useInviteActions, useInvites, useRemoveUser, useSetRole, useUsers } from '../data/hooks'
import { NARROW, useMediaQuery } from '../hooks/useLayout'
import {
  Alert,
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
  /** The root group, which represents the instance. Its can flags say whether the user can invite and set roles. */
  root: Group
  /** Opens a group's view. Called after starting a DM with a user. */
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
      // The clipboard is unavailable, for example over http or without permission. The field is still selectable.
    }
  }
  return (
    <Stack gap={1}>
      <Input value={url} readOnly selectOnFocus />
      <Row gap={2} align="center">
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="danger" icon="remove" onClick={onRevoke}>
          Revoke
        </Button>
        <Row push="end">
          <Text variant="small">
            Expires <Time at={invite.expires_at} />
            {invite.uses > 0 && ` · ${invite.uses} joined with this link`}
          </Text>
        </Row>
      </Row>
    </Stack>
  )
}

const ROLE_WORD: Record<Member['role'], string> = {
  owner: 'runs this community',
  moderator: 'moderator',
  member: '',
}

/**
 * Lists every user on the instance, who are the root group's members. Staff
 * create invite links here and the owner sets roles. Both permissions come
 * from the root group's can flags.
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
  const [creating, setCreating] = useState(false)
  // On a phone, Message in a row keeps its icon and drops its label, so a long username has room.
  const narrow = useMediaQuery(NARROW)

  const invite = async () => {
    setCreating(true)
    try {
      await create()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite')
    } finally {
      setCreating(false)
    }
  }
  const change = async (u: Member) => {
    try {
      await setRole(u.id, u.role === 'moderator' ? 'member' : 'moderator')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the role')
    }
  }
  // The server decides for each user whether they can be removed (architecture.md, Admin tools).
  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await removeUser(removing.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove this person')
    } finally {
      setBusy(false)
      setRemoving(null)
    }
  }
  const message = async (u: Member) => {
    try {
      onOpenGroup((await openDM(u.id)).id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a conversation')
    }
  }

  // Staff actions on one user, in a three-dot menu on their row. The Message button stays outside the menu.
  const items = (u: Member): MenuItem[] => {
    const out: MenuItem[] = []
    if (root.can.set_roles && u.role !== 'owner')
      out.push({
        label: u.role === 'moderator' ? 'Make member' : 'Make moderator',
        onSelect: () => void change(u),
      })
    if (u.can.remove) out.push({ label: 'Remove', icon: 'remove', danger: true, onSelect: () => setRemoving(u) })
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
                  <Text variant="secondary">
                    Invite links are active for seven days and can be used multiple times. Create a new one whenever you
                    need to.
                  </Text>
                  <Row>
                    <Button busy={creating} onClick={() => void invite()}>
                      Create invite link
                    </Button>
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
                {error && <Alert tone="error">{error}</Alert>}
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
                            <Button
                              variant="ghost"
                              icon="chat"
                              label={`Message ${u.username}`}
                              onClick={() => void message(u)}
                            >
                              {narrow ? undefined : 'Message'}
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
        title={removing ? `Remove ${removing.username} from this community?` : ''}
        confirmLabel="Remove"
        icon="remove"
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      >
        <Text variant="secondary">
          Their posts, comments and messages stay, under a removed name. They cannot sign in again. This action cannot
          be undone.
        </Text>
      </ConfirmDialog>
    </Pane>
  )
}
