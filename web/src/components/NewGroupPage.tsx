import { useState } from 'react'
import type { Group, GroupMode } from '../api'
import { useGroupActions } from '../data/hooks'
import { Alert, Button, Card, Field, Form, Input, Measure, Pane, Row, ScrollArea, Select, Stack, Text } from '../ui'

interface NewGroupPageProps {
  onCreated: (group: Group) => void
}

const MODES: { value: GroupMode; label: string }[] = [
  { value: 'both', label: 'Posts and chat' },
  { value: 'posts', label: 'Posts only' },
  { value: 'chat', label: 'Chat only' },
]

/** The page for creating a group. A group needs a name and a mode. Everything else is set through memberships. */
export function NewGroupPage({ onCreated }: NewGroupPageProps) {
  const { create } = useGroupActions()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<GroupMode>('both')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      onCreated(await create(name.trim(), mode))
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
              <Text variant="secondary">
                Rooms are private and only visible to their members. You can add new members from the room settings.
              </Text>
              <Form onSubmit={() => void submit()}>
                <Field label="Room name">
                  <Input value={name} onChange={setName} autoFocus required />
                </Field>
                <Field
                  label="Mode"
                  hint="Posts are longer pieces that people comment on. Chat is a running conversation."
                >
                  <Select value={mode} options={MODES} onChange={setMode} />
                </Field>
                {error && <Alert tone="error">{error}</Alert>}
                <Row>
                  <Button type="submit" disabled={busy || !name.trim()}>
                    {busy ? 'Creating…' : 'Create room'}
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
