import { useEffect, useRef, useState } from 'react'
import { resendVerification, verifyEmail, type User } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Field, Form, Heading, Input, Link, Row, Text } from '../ui'

interface VerifyProps {
  token: string
  /** The community's name, for the frame. */
  name?: string
  /** Called when the address is verified and the session is issued, with the signed-in user. */
  onVerified: (me: User) => void
}

/**
 * The page a verification link opens (architecture.md, Accounts). The token
 * is used once, on arrival. A used, expired or invalid link shows an error
 * and offers to send a new link.
 */
export function Verify({ token, name, onVerified }: VerifyProps) {
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState(false)
  // Run the effect once, even though React runs effects twice in development.
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
    <AuthFrame name={name}>
      {error ? (
        <>
          <Heading level={2}>This link does not work</Heading>
          <Alert tone="error">{error}</Alert>
          {asked ? (
            <Text>If that address belongs to an account waiting to be verified, a new link has been sent.</Text>
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
    </AuthFrame>
  )
}
