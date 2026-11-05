import { useState } from 'react'
import type { Group, User } from '../api'
import { useGroupActions, useUsers } from '../data/hooks'
import { Button, Card, Field, Form, Heading, Measure, Pane, Row, ScrollArea, Select, Stack, Text } from '../ui'

interface NewMessagePageProps {
  me: User
  /** The conversation with the person picked: the one that exists, or a new one. */
  onOpened: (group: Group) => void
}

/** New message, the Messages section's own control: pick a person; more join from the conversation's Members. */
export function NewMessagePage({ me, onOpened }: NewMessagePageProps) {
  const { data: users } = useUsers()
  const { openDM } = useGroupActions()
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const people = [...(users?.values() ?? [])].filter((u) => u.id !== me.id)

  const start = async () => {
    if (busy || !to) return
    setBusy(true)
    setError(null)
    try {
      onOpened(await openDM([to]))
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
              <Heading level={2}>New message</Heading>
              <Text variant="secondary">
                A conversation with one person, or the one you already have. Add more people from its Members.
              </Text>
              <Form onSubmit={() => void start()}>
                <Field label="To">
                  <Select
                    value={to}
                    options={[
                      { value: '', label: 'Choose a person…' },
                      ...people.map((u) => ({ value: u.id, label: u.username })),
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
