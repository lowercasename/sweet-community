import { useEffect, useRef, useState } from 'react'
import { resendVerification, verifyEmail, type User } from '../api'
import { Alert, Button, Card, Centered, Field, Form, Heading, Input, Link, Row, Stack, Text, Wordmark } from '../ui'

interface VerifyProps {
  token: string
  /** The address is verified and the session issued: hand over who I am. */
  onVerified: (me: User) => void
}

/**
 * The page a verification link opens (architecture.md, Accounts). The token
 * is spent on arrival, once: a used, expired or made-up link says so and
 * offers a new one.
 */
export function Verify({ token, onVerified }: VerifyProps) {
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState(false)
  // Once, whatever React does with effects in development.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    verifyEmail(token)
      .then((s) => onVerified(s.user))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'That link does not work'))
  }, [token, onVerified])

  const resend = async () => {
    if (busy) return
    setBusy(true)
    try {
      await resendVerification(email.trim())
      setAsked(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <Card>
        <Stack gap={3}>
          <Wordmark expanded />
          {error ? (
            <>
              <Heading level={2}>This link does not work</Heading>
              <Alert tone="error">{error}</Alert>
              {asked ? (
                <Text>If that address has an account waiting to be verified, a new link is on its way.</Text>
              ) : (
                <Form onSubmit={() => void resend()}>
                  <Field label="Send a new link to">
                    <Input type="email" name="email" value={email} onChange={setEmail} autoComplete="email" required />
                  </Field>
                  <Row justify="between" align="center">
                    <Text as="span" variant="small">
                      <Link href="/">Sign in</Link>
                    </Text>
                    <Button type="submit" disabled={busy || !email.trim()}>
                      {busy ? 'Sending…' : 'Send a new link'}
                    </Button>
                  </Row>
                </Form>
              )}
            </>
          ) : (
            <Text>Verifying your address…</Text>
          )}
        </Stack>
      </Card>
    </Centered>
  )
}
