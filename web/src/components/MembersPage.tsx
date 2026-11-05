import { useState } from 'react'
import type { Group, GroupMode, Membership, User } from '../api'
import { useGroupActions, useMembers, useSetRole, useUsers } from '../data/hooks'
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Heading,
  Input,
  List,
  ListItem,
  Measure,
  Pane,
  Row,
  ScrollArea,
  Select,
  Stack,
  Text,
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
 * Who is in a group and, for those the group's can flags allow, the controls:
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
    { kind: 'handover'; to: Membership } | { kind: 'leave' } | { kind: 'delete' } | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setProblem(null)
    try {
      await fn()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  // To people a named group is a room and a DM a conversation.
  const word = group.kind === 'dm' ? 'conversation' : 'room'
  const inGroup = new Set(members.map((m) => m.user.id))
  const candidates = [...(users?.values() ?? [])].filter((u) => !inGroup.has(u.id))
  const dirty = name.trim() !== group.name || mode !== group.mode
  const canEdit = group.can.rename || group.can.set_mode

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
                    <Field label="Name">
                      <Input value={name} onChange={setName} />
                    </Field>
                  )}
                  {group.can.set_mode && (
                    <Field label="Mode">
                      <Select value={mode} options={MODES} onChange={setMode} />
                    </Field>
                  )}
                  <Row gap={3} align="center">
                    <Button
                      disabled={busy || !dirty || !name.trim()}
                      onClick={() =>
                        void run(() =>
                          actions.update(group.id, {
                            ...(group.can.rename && name.trim() !== group.name ? { name: name.trim() } : {}),
                            ...(group.can.set_mode && mode !== group.mode ? { mode } : {}),
                          }),
                        )
                      }
                    >
                      Save
                    </Button>
                    {group.can.delete && (
                      <Button
                        variant="ghost"
                        icon="trash"
                        disabled={busy}
                        onClick={() => setConfirm({ kind: 'delete' })}
                      >
                        Delete room
                      </Button>
                    )}
                  </Row>
                </Stack>
              </Card>
            )}
            <Card>
              <Stack gap={2}>
                <Heading level={2}>Members</Heading>
                {loading && <Text variant="secondary">Loading…</Text>}
                {error && <Text variant="secondary">{error.message}</Text>}
                {problem && <Text variant="secondary">{problem}</Text>}
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
                      disabled={busy || !pick}
                      onClick={() => void run(() => actions.add(group.id, pick).then(() => setPick('')))}
                    >
                      Add
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
                            <Avatar name={m.user.username} picture={m.user.picture} />
                            <PersonName user={m.user} />
                            <Text as="span" variant="small">
                              {ROLE_WORD[m.role] && `${ROLE_WORD[m.role]} · `}
                              joined <Time at={m.joined_at} />
                            </Text>
                          </Row>
                          {!self && m.role !== 'owner' && (
                            <Row gap={1} align="center" shrink={false}>
                              {group.can.set_roles && (
                                <Button
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(() => setRole(m.user.id, m.role === 'moderator' ? 'member' : 'moderator'))
                                  }
                                >
                                  {m.role === 'moderator' ? 'Make member' : 'Make moderator'}
                                </Button>
                              )}
                              {group.can.transfer && (
                                <Button
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => setConfirm({ kind: 'handover', to: m })}
                                >
                                  Make owner
                                </Button>
                              )}
                              {group.can.remove_members && (
                                <Button
                                  variant="ghost"
                                  icon="remove"
                                  disabled={busy}
                                  onClick={() => void run(() => actions.removeMember(group.id, m.user.id))}
                                >
                                  Remove
                                </Button>
                              )}
                            </Row>
                          )}
                        </Row>
                      </ListItem>
                    )
                  })}
                </List>
                {group.can.leave && (
                  <Row>
                    <Button
                      variant="secondary"
                      icon="logout"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'leave' })}
                    >
                      Leave {word}
                    </Button>
                  </Row>
                )}
              </Stack>
            </Card>
          </Stack>
        </Measure>
      </ScrollArea>
      <ConfirmDialog
        open={confirm?.kind === 'handover'}
        title={confirm?.kind === 'handover' ? `Make ${confirm.to.user.username} the owner?` : ''}
        confirmLabel="Switch ownership"
        busy={busy}
        onConfirm={() => confirm?.kind === 'handover' && void run(() => setRole(confirm.to.user.id, 'owner'))}
        onClose={() => setConfirm(null)}
      >
        <Text variant="secondary">
          You will become a moderator. Only the new owner can make you or someone else an owner.
        </Text>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'leave'}
        title={`Leave this ${word}?`}
        confirmLabel="Leave"
        busy={busy}
        onConfirm={() => void run(() => actions.leave(group.id, me.id).then(onLeft))}
        onClose={() => setConfirm(null)}
      >
        <Text variant="secondary">Someone in it will have to add you again.</Text>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="Delete this room?"
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void run(() => actions.remove(group.id).then(onLeft))}
        onClose={() => setConfirm(null)}
      >
        <Text variant="secondary">Its posts and chat go with it, for everyone. This action cannot be undone.</Text>
      </ConfirmDialog>
    </Pane>
  )
}
