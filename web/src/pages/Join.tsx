import { useEffect, useState } from 'react'
import { changeUnverifiedEmail, getInvite, register } from '../api'
import { CheckEmail } from '../components/CheckEmail'
import { Alert, Button, Card, Centered, Field, Form, Input, Row, Stack, Text, Wordmark } from '../ui'

interface JoinProps {
  code: string
}

/**
 * The page an invite link opens: who invited you, pick a name, a password and
 * an address, and a link goes to the address; opening it is what signs you in
 * (architecture.md, Accounts).
 */
export function Join({ code }: JoinProps) {
  const [invitedBy, setInvitedBy] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

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
      const res = await register(code, username.trim(), password, email.trim())
      setSentTo(res.email)
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
          ) : sentTo ? (
            <CheckEmail
              email={sentTo}
              onChangeAddress={(to) => changeUnverifiedEmail(username.trim(), password, to)}
              backLabel="Back to the start"
              onBack={() => setSentTo(null)}
            />
          ) : (
            <Form onSubmit={() => void submit()}>
              <Text>
                {invitedBy
                  ? `${invitedBy} invited you. Choose a username and a password, and say where to send your sign-in link.`
                  : 'Checking your invite…'}
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
              <Field label="Email address">
                <Input type="email" name="email" value={email} onChange={setEmail} autoComplete="email" required />
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
              {error && <Alert tone="error">{error}</Alert>}
              <Row justify="end" align="center">
                <Button type="submit" disabled={busy || !invitedBy || !username || !email || !password}>
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
