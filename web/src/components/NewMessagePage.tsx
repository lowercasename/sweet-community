import { useState } from 'react'
import type { Group, User } from '../api'
import { useGroupActions, useUsers } from '../data/hooks'
import { Alert, Button, Card, Field, Form, Measure, Pane, Row, ScrollArea, Select, Stack, Text } from '../ui'

interface NewMessagePageProps {
  me: User
  /** Called with the conversation with the chosen user, either the existing one or a new one. */
  onOpened: (group: Group) => void
}

/**
 * The New message page, opened from the Messages section's own control
 * (architecture.md, Layout). The user chooses one other user, and Start opens
 * the conversation with them, either the existing one or a new one. A
 * conversation has two users. For more users, the user creates a group.
 */
export function NewMessagePage({ me, onOpened }: NewMessagePageProps) {
  const { data: users } = useUsers()
  const { openDM } = useGroupActions()
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const candidates = [...(users?.values() ?? [])].filter((u) => u.id !== me.id)

  const start = async () => {
    if (busy || !to) return
    setBusy(true)
    setError(null)
    try {
      onOpened(await openDM(to))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a conversation')
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
                Start a direct, private conversation with one person. If you want to create a private space with
                multiple people, create a Room.
              </Text>
              <Form onSubmit={() => void start()}>
                <Field label="To">
                  <Select
                    label="To"
                    value={to}
                    options={[
                      { value: '', label: 'Choose a person…' },
                      ...candidates.map((u) => ({ value: u.id, label: u.username })),
                    ]}
                    onChange={setTo}
                  />
                </Field>
                {error && <Alert tone="error">{error}</Alert>}
                <Row>
                  <Button type="submit" disabled={busy || !to}>
                    {busy ? 'Opening…' : 'Start'}
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
