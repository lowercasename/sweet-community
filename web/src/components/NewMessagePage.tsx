import { useState } from 'react'
import type { Group, Member, User } from '../api'
import { useGroupActions, useUsers } from '../data/hooks'
import { Avatar, Button, Card, Field, Form, Measure, Pane, Row, ScrollArea, Select, Stack, Text } from '../ui'

interface NewMessagePageProps {
  me: User
  /** People already chosen: a conversation's own, from its People page. */
  initial?: string[]
  /** The conversation of exactly the people chosen: the one that exists, or a new one. */
  onOpened: (group: Group) => void
}

/**
 * New message, the Messages section's own control (architecture.md,
 * Layout): the people a conversation is with, any number, and Start opens
 * the conversation of exactly them, found or made.
 */
export function NewMessagePage({ me, initial = [], onOpened }: NewMessagePageProps) {
  const { data: users } = useUsers()
  const { openDM } = useGroupActions()
  const [to, setTo] = useState<string[]>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = to.map((id) => users?.get(id)).filter((u): u is Member => u !== undefined && u.id !== me.id)
  const candidates = [...(users?.values() ?? [])].filter((u) => u.id !== me.id && !to.includes(u.id))

  const start = async () => {
    if (busy || chosen.length === 0) return
    setBusy(true)
    setError(null)
    try {
      onOpened(await openDM(chosen.map((u) => u.id)))
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
                A conversation with these people: the one you already have with exactly them, or a new one.
              </Text>
              <Form onSubmit={() => void start()}>
                <Field label="To">
                  <Stack gap={1}>
                    {chosen.length > 0 && (
                      <Row gap={3} align="center">
                        {chosen.map((u) => (
                          <Row key={u.id} gap={1} align="center">
                            <Avatar name={u.username} picture={u.picture} size="sm" />
                            <Text as="span" variant="name">
                              {u.username}
                            </Text>
                            <Button
                              variant="ghost"
                              icon="remove"
                              label={`Remove ${u.username}`}
                              onClick={() => setTo(to.filter((id) => id !== u.id))}
                            />
                          </Row>
                        ))}
                      </Row>
                    )}
                    {candidates.length > 0 && (
                      <Select
                        label="Add someone"
                        value=""
                        options={[
                          { value: '', label: 'Add someone…' },
                          ...candidates.map((u) => ({ value: u.id, label: u.username })),
                        ]}
                        onChange={(id) => id && setTo([...to, id])}
                      />
                    )}
                  </Stack>
                </Field>
                {error && <Text variant="secondary">{error}</Text>}
                <Row>
                  <Button type="submit" disabled={busy || chosen.length === 0}>
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
