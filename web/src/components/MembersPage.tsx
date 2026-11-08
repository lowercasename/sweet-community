import { useState } from 'react'
import { uploadImage, type Group, type GroupMode, type Membership, type User } from '../api'
import { IMAGE_ACCEPT } from '../editor/images'
import { useGroupActions, useMembers, useSetRole, useUsers } from '../data/hooks'
import {
  ActionRow,
  ActionRows,
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  FilePicker,
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
  Select,
  Stack,
  Text,
  Tile,
  Time,
} from '../ui'
import { PersonName } from './PersonName'

interface MembersPageProps {
  group: Group
  me: User
  /** After I have left or deleted the group: there is nothing here to show any more. */
  onLeft: () => void
}

const MODES: { value: GroupMode; label: string }[] = [
  { value: 'both', label: 'Posts and chat' },
  { value: 'posts', label: 'Posts only' },
  { value: 'chat', label: 'Chat only' },
]

const ROLE_WORD: Record<Membership['role'], string> = {
  owner: 'owner',
  moderator: 'moderator',
  member: '',
}

/**
 * Who is in a room and, for those the room's can flags allow, the controls:
 * add and remove people, set roles, hand the group over, rename it, set its
 * mode, delete it, leave it. Nothing here reasons about roles.
 */
export function MembersPage({ group, me, onLeft }: MembersPageProps) {
  const { members, loading, error } = useMembers(group.id)
  const { data: users } = useUsers()
  const actions = useGroupActions()
  const setRole = useSetRole(group.id)
  const [pick, setPick] = useState('')
  const [name, setName] = useState(group.name)
  const [mode, setMode] = useState<GroupMode>(group.mode)
  const [confirm, setConfirm] = useState<
    | { kind: 'handover'; to: Membership }
    | { kind: 'remove'; who: Membership }
    | { kind: 'leave' }
    | { kind: 'delete' }
    | null
  >(null)
  // Which action is running, so only its button shows the spinner. Every button is disabled while any runs.
  const [working, setWorking] = useState<string | null>(null)
  const busy = working !== null
  const [problem, setProblem] = useState<string | null>(null)

  const run = async (which: string, fn: () => Promise<void>) => {
    setWorking(which)
    setProblem(null)
    try {
      await fn()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setWorking(null)
      setConfirm(null)
    }
  }

  const choosePicture = async (file: File) => {
    const img = await uploadImage(file)
    await actions.setPicture(group.id, img.id)
  }

  const inGroup = new Set(members.map((m) => m.user.id))
  const candidates = [...(users?.values() ?? [])].filter((u) => !inGroup.has(u.id))
  const dirty = name.trim() !== group.name || mode !== group.mode
  const canEdit = group.can.rename || group.can.set_mode

  // What I may do to one member, behind a three-dot menu on their row (the server's can flags say what).
  const items = (m: Membership): MenuItem[] => {
    const out: MenuItem[] = []
    if (group.can.set_roles)
      out.push({
        label: m.role === 'moderator' ? 'Make member' : 'Make moderator',
        onSelect: () => void run('role', () => setRole(m.user.id, m.role === 'moderator' ? 'member' : 'moderator')),
      })
    if (group.can.transfer) out.push({ label: 'Make owner', onSelect: () => setConfirm({ kind: 'handover', to: m }) })
    if (group.can.remove_members)
      out.push({
        label: 'Remove',
        icon: 'remove',
        danger: true,
        onSelect: () => setConfirm({ kind: 'remove', who: m }),
      })
    return out
  }
  // The last card: the room's destructive actions, least to most consequential (architecture.md, Interface, pattern 3).
  // The owner cannot leave, so in practice it holds Leave room for everyone else and Delete room for the owner.
  const ending = group.can.leave || group.can.delete

  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            {canEdit && (
              <Card>
                <Stack gap={2}>
                  <Heading level={2}>Room settings</Heading>
                  {group.can.rename && (
                    <Row gap={2} align="center">
                      <Tile name={group.name} picture={group.picture} size="md" />
                      <FilePicker
                        accept={IMAGE_ACCEPT}
                        variant="secondary"
                        icon="image"
                        label="Choose a picture"
                        disabled={busy}
                        busy={working === 'picture'}
                        onPick={(files) => void run('picture', () => choosePicture(files[0]))}
                      >
                        Choose a picture
                      </FilePicker>
                      {group.picture && (
                        <Button
                          variant="danger"
                          icon="remove"
                          disabled={busy}
                          busy={working === 'unpicture'}
                          onClick={() => void run('unpicture', () => actions.setPicture(group.id, null))}
                        >
                          Remove picture
                        </Button>
                      )}
                    </Row>
                  )}
                  {group.can.rename && (
                    <Field label="Name">
                      <Input value={name} onChange={setName} />
                    </Field>
                  )}
                  {group.can.set_mode && (
                    <Field
                      label="Mode"
                      hint="Posts are longer pieces that people comment on. Chat is a running conversation."
                    >
                      <Select value={mode} options={MODES} onChange={setMode} />
                    </Field>
                  )}
                  <Row justify="end">
                    <Button
                      disabled={!dirty || !name.trim() || (busy && working !== 'save')}
                      busy={working === 'save'}
                      onClick={() =>
                        void run('save', () =>
                          actions.update(group.id, {
                            ...(group.can.rename && name.trim() !== group.name ? { name: name.trim() } : {}),
                            ...(group.can.set_mode && mode !== group.mode ? { mode } : {}),
                          }),
                        )
                      }
                    >
                      Save
                    </Button>
                  </Row>
                </Stack>
              </Card>
            )}
            <Card>
              <Stack gap={2}>
                <Heading level={2}>Members</Heading>
                <Text variant="small">
                  Moderators can delete anything in the room and add or remove members. The owner can also change its
                  settings and hand it over.
                </Text>
                {loading && <Text variant="secondary">Loading…</Text>}
                {error && <Alert tone="error">{error.message}</Alert>}
                {problem && <Alert tone="error">{problem}</Alert>}
                {group.can.add_members && !loading && candidates.length > 0 && (
                  <Row gap={2} align="center">
                    <Select
                      label="Add someone"
                      value={pick}
                      options={[
                        { value: '', label: 'Choose a person…' },
                        ...candidates.map((u) => ({
                          value: u.id,
                          label: u.username,
                        })),
                      ]}
                      onChange={setPick}
                    />
                    <Button
                      variant="secondary"
                      disabled={!pick || (busy && working !== 'add')}
                      busy={working === 'add'}
                      onClick={() => void run('add', () => actions.add(group.id, pick).then(() => setPick('')))}
                    >
                      Add to room
                    </Button>
                  </Row>
                )}

                <List>
                  {members.map((m) => {
                    const self = m.user.id === me.id
                    return (
                      <ListItem key={m.user.id}>
                        <Row justify="between" align="center" wrap="narrow">
                          <Row gap={2} align="center">
                            <PersonName user={m.user} avatar="md" />
                            <Text as="span" variant="small">
                              {ROLE_WORD[m.role] && `${ROLE_WORD[m.role]} · `}
                              joined <Time at={m.joined_at} />
                            </Text>
                          </Row>
                          {!self && m.role !== 'owner' && !busy && items(m).length > 0 && (
                            <Menu label={`Options for ${m.user.username}`} items={items(m)} />
                          )}
                        </Row>
                      </ListItem>
                    )
                  })}
                </List>
              </Stack>
            </Card>
            {ending && (
              <Card>
                <ActionRows>
                  {group.can.leave && (
                    <ActionRow
                      title="Leave room"
                      action={
                        <Button
                          variant="danger"
                          icon="logout"
                          disabled={busy}
                          onClick={() => setConfirm({ kind: 'leave' })}
                        >
                          Leave room
                        </Button>
                      }
                    >
                      You will need to be added by an existing room member if you want to rejoin.
                    </ActionRow>
                  )}
                  {group.can.delete && (
                    <ActionRow
                      title="Delete room"
                      action={
                        <Button
                          variant="danger"
                          icon="trash"
                          disabled={busy}
                          onClick={() => setConfirm({ kind: 'delete' })}
                        >
                          Delete room
                        </Button>
                      }
                    >
                      Its posts and chat will be deleted for everyone.
                    </ActionRow>
                  )}
                </ActionRows>
              </Card>
            )}
          </Stack>
        </Measure>
      </ScrollArea>
      <ConfirmDialog
        open={confirm?.kind === 'handover'}
        title={confirm?.kind === 'handover' ? `Make ${confirm.to.user.username} the owner?` : ''}
        confirmLabel="Make owner"
        busy={busy}
        onConfirm={() =>
          confirm?.kind === 'handover' && void run('handover', () => setRole(confirm.to.user.id, 'owner'))
        }
        onClose={() => setConfirm(null)}
      >
        <Text variant="secondary">
          You will become a moderator. Only the new owner can make you or someone else an owner.
        </Text>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        title={confirm?.kind === 'remove' ? `Remove ${confirm.who.user.username} from this room?` : ''}
        confirmLabel="Remove"
        icon="remove"
        busy={busy}
        onConfirm={() =>
          confirm?.kind === 'remove' && void run('remove', () => actions.removeMember(group.id, confirm.who.user.id))
        }
        onClose={() => setConfirm(null)}
      >
        <Text variant="secondary">
          They will no longer see the room. Anyone who can add members can add them again.
        </Text>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'leave'}
        title="Leave this room?"
        confirmLabel="Leave room"
        icon="logout"
        busy={busy}
        onConfirm={() => void run('leave', () => actions.leave(group.id, me.id).then(onLeft))}
        onClose={() => setConfirm(null)}
      >
        <Text variant="secondary">You will need to be added by an existing room member if you want to rejoin.</Text>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="Delete this room?"
        confirmLabel="Delete room"
        icon="trash"
        busy={busy}
        onConfirm={() => void run('delete', () => actions.remove(group.id).then(onLeft))}
        onClose={() => setConfirm(null)}
      >
        <Text variant="secondary">Its posts and chat will be deleted for everyone. This action cannot be undone.</Text>
      </ConfirmDialog>
    </Pane>
  )
}
