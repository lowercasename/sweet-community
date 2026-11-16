import { useState } from 'react'
import { useLocation } from 'wouter'
import type { Group, RoomVisibility } from '../api'
import { useGroupActions } from '../data/hooks'
import { Alert, Button, Card, Field, Form, Input, Measure, Pane, Row, ScrollArea, RadioCards, Stack, Text } from '../ui'

interface NewGroupPageProps {
  onCreated: (group: Group) => void
}

/** The page for creating a group. A room has a name and an audience. Both audiences have posts and chat. */
export function NewGroupPage({ onCreated }: NewGroupPageProps) {
  const { create } = useGroupActions()
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<RoomVisibility>('private')
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      onCreated(await create(name.trim(), visibility))
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
                  <Input value={name} onChange={setName} autoFocus required maxLength={80} />
                </Field>
                <RadioCards
                  label="Visibility"
                  value={visibility}
                  onChange={setVisibility}
                  disabled={busy}
                  options={[
                    {
                      value: 'private',
                      label: 'Private',
                      icon: 'lock',
                      description: 'Only people you invite.',
                    },
                    {
                      value: 'open',
                      label: 'Open',
                      icon: 'globe',
                      description: 'Everyone in the community. Posts also appear on Home.',
                    },
                  ]}
                />
                <Text variant="small">Visibility can’t be changed later.</Text>
                {error && <Alert tone="error">{error}</Alert>}
                <Row justify="end">
                  <Button variant="ghost" disabled={busy} onClick={() => navigate('/')}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!name.trim()} busy={busy}>
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
