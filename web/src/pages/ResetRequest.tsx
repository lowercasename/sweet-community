import { useState } from 'react'
import { requestReset } from '../api'
import { Alert, Button, Card, Centered, Field, Form, Heading, Input, Link, Row, Stack, Text, Wordmark } from '../ui'

/** Forgot the password: an address, and a link goes there if it has an account. The answer never says which. */
export function ResetRequest() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await requestReset(email.trim())
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <Card>
        <Stack gap={3}>
          <Wordmark expanded />
          <Heading level={2}>Reset your password</Heading>
          {sent ? (
            <>
              <Text>
                If{' '}
                <Text as="span" weight="bold">
                  {email.trim()}
                </Text>{' '}
                has an account here, a link to choose a new password is on its way. It works for an hour.
              </Text>
              <Text variant="small">
                <Link href="/">Back to sign in</Link>
              </Text>
            </>
          ) : (
            <Form onSubmit={() => void submit()}>
              <Field label="Email address">
                <Input
                  type="email"
                  name="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </Field>
              {error && <Alert tone="error">{error}</Alert>}
              <Row justify="between" align="center">
                <Text as="span" variant="small">
                  <Link href="/">Back to sign in</Link>
                </Text>
                <Button type="submit" disabled={busy || !email.trim()}>
                  {busy ? 'Sending…' : 'Send a link'}
                </Button>
              </Row>
            </Form>
          )}
        </Stack>
      </Card>
    </Centered>
  )
}
