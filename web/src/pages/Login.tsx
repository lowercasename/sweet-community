import { useState } from 'react'
import { login, type Me } from '../api'
import { Button, Card, Centered, Field, Form, Input, Row, Stack, Text, Wordmark } from '../ui'

interface LoginProps {
  onSignedIn: (me: Me) => void
}

export function Login({ onSignedIn }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const session = await login(username.trim(), password)
      onSignedIn(session.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <Card>
        <Stack gap={3}>
          <Wordmark expanded />
          <Form onSubmit={() => void submit()}>
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
                autoComplete="current-password"
                required
              />
            </Field>
            {error && <Text variant="secondary">{error}</Text>}
            <Row justify="between" align="center">
              <Text as="span" variant="small">
                No account? Ask for an invite link.
              </Text>
              <Button type="submit" disabled={busy || !username || !password}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </Row>
          </Form>
        </Stack>
      </Card>
    </Centered>
  )
}
