import { useState } from 'react'
import { useLocation } from 'wouter'
import type { Group, GroupMode, RoomVisibility } from '../api'
import { useGroupActions, useMe, useUsers } from '../data/hooks'
import {
  Alert,
  Button,
  Card,
  Field,
  Form,
  Input,
  Measure,
  Pane,
  Row,
  ScrollArea,
  RadioCards,
  PeoplePicker,
  Stack,
  Text,
  Textarea,
} from '../ui'

import { RoomMode } from './RoomMode'

interface NewGroupPageProps {
  onCreated: (group: Group) => void
}

/** Create a room with an audience and a choice of posts, chat or both. */
export function NewGroupPage({ onCreated }: NewGroupPageProps) {
  const { create } = useGroupActions()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<GroupMode>('both')
  const [visibility, setVisibility] = useState<RoomVisibility>('open')
  const [members, setMembers] = useState<string[]>([])
  const { data: me } = useMe()
  const users = useUsers()
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const waitingForPeople = visibility === 'private' && (!users.data || !me || !!users.error)

  const submit = async () => {
    if (busy || !name.trim() || waitingForPeople) return
    setBusy(true)
    setError(null)
    try {
      onCreated(
        await create(name.trim(), visibility, visibility === 'private' ? members : [], description.trim(), mode),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the room')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            <Stack gap={2}>
              <Form onSubmit={() => void submit()}>
                <Field label="Room name">
                  <Input value={name} onChange={setName} autoFocus required maxLength={80} readOnly={busy} />
                </Field>
                <Field label="Description" hint="Optional. Up to 140 characters.">
                  <Textarea value={description} onChange={setDescription} maxLength={140} rows={3} readOnly={busy} />
                </Field>
                <RoomMode value={mode} onChange={setMode} disabled={busy} />
                <RadioCards
                  label="Visibility"
                  value={visibility}
                  onChange={setVisibility}
                  disabled={busy}
                  options={[
                    {
                      value: 'open',
                      label: 'Open',
                      icon: 'globe',
                      description:
                        mode === 'chat'
                          ? 'Everyone in the community.'
                          : 'Everyone in the community. Posts also appear on Home.',
                    },
                    {
                      value: 'private',
                      label: 'Private',
                      icon: 'lock',
                      description: 'Only people you invite.',
                    },
                  ]}
                />
                <Text variant="small">Visibility can’t be changed later.</Text>
                {visibility === 'private' &&
                  (users.error ? (
                    <Stack gap={2}>
                      <Alert tone="error">{users.error.message}</Alert>
                      <Row>
                        <Button variant="secondary" onClick={() => void users.refetch()}>
                          Try again
                        </Button>
                      </Row>
                    </Stack>
                  ) : !users.data || !me ? (
                    <Text variant="small">Loading people…</Text>
                  ) : (
                    <PeoplePicker
                      people={[...users.data.values()]
                        .filter((person) => person.id !== me.id)
                        .map((person) => ({ id: person.id, name: person.username, picture: person.picture }))
                        .sort((a, b) => a.name.localeCompare(b.name))}
                      value={members}
                      onChange={setMembers}
                      disabled={busy}
                    />
                  ))}
                {error && <Alert tone="error">{error}</Alert>}
                <Row justify="end">
                  <Button variant="ghost" disabled={busy} onClick={() => navigate('/')}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!name.trim() || waitingForPeople} busy={busy}>
                    Create room
                  </Button>
                </Row>
              </Form>
            </Stack>
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
