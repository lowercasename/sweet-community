import { useState } from 'react'
import type { Group, User } from '../api'
import { useGroupActions, useUsers } from '../data/hooks'
import { Button, Card, Field, Form, Measure, Pane, Row, ScrollArea, Select, Stack, Text } from '../ui'

interface NewMessagePageProps {
  me: User
  /** The conversation with the person chosen: the one that exists, or a new one. */
  onOpened: (group: Group) => void
}

/**
 * New message, the Messages section's own control (architecture.md,
 * Layout): one person, and Start opens the conversation with them, found or
 * made. A conversation is two people; for more, make a room.
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
                A conversation with one person: the one you already have with them, or a new one. For more people, make
                a room.
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
                {error && <Text variant="secondary">{error}</Text>}
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
