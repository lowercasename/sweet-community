import { useState } from 'react'
import { ApiError, changeUnverifiedEmail, login, type Settings, type User } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { CheckEmail } from '../components/CheckEmail'
import { RESET } from '../routes'
import { Alert, Button, Field, Form, Input, Link, Row, Text } from '../ui'

interface LoginProps {
  community?: Settings
  onSignedIn: (me: User) => void
}

export function Login({ community, onSignedIn }: LoginProps) {
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
    <AuthFrame name={community?.name}>
      {community && !community.owner_set ? (
        <Text variant="secondary">This community has not been set up yet.</Text>
      ) : unverified ? (
        <CheckEmail
          email={unverified}
          onChangeAddress={(to) => changeUnverifiedEmail(username.trim(), password, to)}
          backLabel="Back to sign in"
          onBack={() => setUnverified(null)}
        />
      ) : (
        <Form onSubmit={() => void submit()}>
          <Field label="Username or email">
            <Input name="username" value={username} onChange={setUsername} autoComplete="username" autoFocus required />
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
            <Button type="submit" disabled={!username || !password} busy={busy}>
              Sign in
            </Button>
          </Row>
        </Form>
      )}
    </AuthFrame>
  )
}
