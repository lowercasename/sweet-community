import { useEffect, useState } from 'react'
import { getInvite, register, type User } from '../api'
import { Button, Card, Centered, Field, Form, Input, Row, Stack, Text, Wordmark } from '../ui'

interface JoinProps {
  code: string
  onJoined: (me: User) => void
}

/** The page an invite link opens: who invited you, pick a name and a password, and you're in. */
export function Join({ code, onJoined }: JoinProps) {
  const [invitedBy, setInvitedBy] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getInvite(code)
      .then((r) => {
        if (!cancelled) setInvitedBy(r.invited_by)
      })
      .catch((e: unknown) => {
        if (!cancelled) setInvalid(e instanceof Error ? e.message : 'This invite link does not work')
      })
    return () => {
      cancelled = true
    }
  }, [code])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const session = await register(code, username.trim(), password)
      onJoined(session.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <Card>
        <Stack gap={3}>
          <Wordmark expanded />
          {invalid ? (
            <Text variant="secondary">{invalid}</Text>
          ) : (
            <Form onSubmit={() => void submit()}>
              <Text>
                {invitedBy ? `${invitedBy} invited you. Choose a username and a password.` : 'Checking your invite…'}
              </Text>
              <Field label="Username">
                <Input
                  name="username"
                  value={username}
                  onChange={setUsername}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  name="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Text variant="small">Letters, digits and underscores; a password of at least 8 characters.</Text>
              {error && <Text variant="secondary">{error}</Text>}
              <Row justify="between" align="center">
                <Text as="span" variant="small">
                  {' '}
                </Text>
                <Button type="submit" disabled={busy || !invitedBy || !username || !password}>
                  {busy ? 'Joining…' : 'Join'}
                </Button>
              </Row>
            </Form>
          )}
        </Stack>
      </Card>
    </Centered>
  )
}
