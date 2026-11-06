import { useState } from 'react'
import { ApiError, changeUnverifiedEmail, login, type User } from '../api'
import { CheckEmail } from '../components/CheckEmail'
import { RESET } from '../routes'
import { Alert, Button, Card, Centered, Field, Form, Input, Link, Row, Stack, Text, Wordmark } from '../ui'

interface LoginProps {
  onSignedIn: (me: User) => void
}

/** Sign in by username or email address. An account whose address is unverified is sent back to its mail. */
export function Login({ onSignedIn }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unverified, setUnverified] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const session = await login(username.trim(), password)
      onSignedIn(session.user)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && e.message === 'unverified' && typeof e.body.email === 'string') {
        setUnverified(e.body.email)
      } else {
        setError(e instanceof Error ? e.message : 'Could not sign in')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <Card>
        <Stack gap={3}>
          <Wordmark expanded />
          {unverified ? (
            <CheckEmail
              email={unverified}
              onChangeAddress={(to) => changeUnverifiedEmail(username.trim(), password, to)}
              backLabel="Back to sign in"
              onBack={() => setUnverified(null)}
            />
          ) : (
            <Form onSubmit={() => void submit()}>
              <Field label="Username or email">
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
              {error && <Alert tone="error">{error}</Alert>}
              <Row justify="between" align="center">
                <Text as="span" variant="small">
                  <Link href={RESET}>Forgot your password?</Link>
                </Text>
                <Button type="submit" disabled={busy || !username || !password}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </Button>
              </Row>
              <Text variant="small">No account? Ask for an invite link.</Text>
            </Form>
          )}
        </Stack>
      </Card>
    </Centered>
  )
}
