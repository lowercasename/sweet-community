import { useState } from 'react'
import { resendVerification } from '../api'
import { Alert, Button, Field, Form, Heading, Input, Link, Row, Stack, Text } from '../ui'

interface CheckEmailProps {
  /** The address the link was sent to. */
  email: string
  /**
   * Changes the address (architecture.md, Accounts: "didn't get it? resend,
   * or change the address"). Resolves once a link has been sent to the new
   * address.
   */
  onChangeAddress: (email: string) => Promise<void>
  /** Returns to the previous screen, which is the sign-in page or the join form. */
  backLabel: string
  onBack: () => void
}

/**
 * The screen shown after joining, and after a sign-in is refused because the
 * address is unverified. It says the link was sent by email, and lets the
 * user resend it or send it to a different address.
 */
export function CheckEmail({ email, onChangeAddress, backLabel, onBack }: CheckEmailProps) {
  const [sent, setSent] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resend = async () => {
    setBusy(true)
    setError(null)
    try {
      await resendVerification(email)
      setSent(email)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the link')
    } finally {
      setBusy(false)
    }
  }
  const change = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onChangeAddress(address.trim())
      setSent(address.trim())
      setChanging(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the address')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap={3}>
      <Heading level={2}>Check your email</Heading>
      <Text>
        A link has been sent to{' '}
        <Text as="span" weight="bold">
          {sent ?? email}
        </Text>
        . Open it to verify your address and sign in. The link expires in a day.
      </Text>
      {sent && <Alert>Sent again. Check your spam folder if it does not arrive.</Alert>}
      {changing ? (
        <Form onSubmit={() => void change()}>
          <Field label="Email address">
            <Input
              type="email"
              name="email"
              value={address}
              onChange={setAddress}
              autoComplete="email"
              autoFocus
              required
            />
          </Field>
          <Row justify="end" gap={2}>
            <Button variant="ghost" disabled={busy} onClick={() => setChanging(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!address.trim()} busy={busy}>
              Send a new link
            </Button>
          </Row>
        </Form>
      ) : (
        <Row gap={2} align="center">
          <Button variant="ghost" disabled={busy} onClick={() => setChanging(true)}>
            Use a different address
          </Button>
          <Button variant="secondary" busy={busy} onClick={() => void resend()}>
            Send a new link
          </Button>
        </Row>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Text variant="small">
        <Link onClick={onBack}>{backLabel}</Link>
      </Text>
    </Stack>
  )
}
