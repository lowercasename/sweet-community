import { useState } from 'react'
import { requestReset } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Field, Form, Heading, Input, Link, Row, Text } from '../ui'

interface ResetRequestProps {
  /** The community's name, for the frame. */
  name?: string
}

/** The forgotten password page. The user enters an email address, and a reset link is sent if the address has an account. The response never reveals whether it does. */
export function ResetRequest({ name }: ResetRequestProps) {
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
    <AuthFrame name={name}>
      <Heading level={2}>Reset your password</Heading>
      {sent ? (
        <>
          <Text>
            If{' '}
            <Text as="span" weight="bold">
              {email.trim()}
            </Text>{' '}
            has an account here, a link to choose a new password has been sent. The link expires in an hour.
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
    </AuthFrame>
  )
}
