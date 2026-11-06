import { useState } from 'react'
import { resetPassword, type User } from '../api'
import { RESET } from '../routes'
import { Alert, Button, Card, Centered, Field, Form, Heading, Input, Link, Row, Stack, Text, Wordmark } from '../ui'

interface ResetPasswordProps {
  token: string
  onReset: (me: User) => void
}

/** The page a reset link opens: a new password, every other session ended, and signed in here. */
export function ResetPassword({ token, onReset }: ResetPasswordProps) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const session = await resetPassword(token, password)
      onReset(session.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <Card>
        <Stack gap={3}>
          <Wordmark expanded />
          <Heading level={2}>Choose a new password</Heading>
          <Form onSubmit={() => void submit()}>
            <Field label="New password">
              <Input
                type="password"
                name="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                autoFocus
                required
              />
            </Field>
            <Text variant="small">At least 8 characters. Every other device will be signed out.</Text>
            {error && <Alert tone="error">{error}</Alert>}
            <Row justify="between" align="center">
              <Text as="span" variant="small">
                <Link href={RESET}>Ask for a new link</Link>
              </Text>
              <Button type="submit" disabled={busy || password.length < 8}>
                {busy ? 'Saving…' : 'Set the password'}
              </Button>
            </Row>
          </Form>
        </Stack>
      </Card>
    </Centered>
  )
}
