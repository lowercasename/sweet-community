import { useState } from 'react'
import { resendVerification } from '../api'
import { Alert, Button, Field, Form, Heading, Input, Row, Stack, Text } from '../ui'

interface CheckEmailProps {
  /** Where the link went. */
  email: string
  /**
   * Replace the address (architecture.md, Accounts: "didn't get it? resend,
   * or change the address"). Resolves once a link is on its way to the new one.
   */
  onChangeAddress: (email: string) => Promise<void>
  /** Back to where this came from: the sign-in page, or the join form. */
  backLabel: string
  onBack: () => void
}

/**
 * The screen after joining, and after a sign-in refused for an unverified
 * address: the link is in the mail; send it again, or send it somewhere else.
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
        A link is on its way to{' '}
        <Text as="span" weight="bold">
          {sent ?? email}
        </Text>
        . Open it to verify your address and sign in. It works for a day.
      </Text>
      {sent && <Alert>Sent again. Give it a minute, and look in the spam folder too.</Alert>}
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
          <Row justify="between" align="center">
            <Button variant="ghost" disabled={busy} onClick={() => setChanging(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !address.trim()}>
              {busy ? 'Sending…' : 'Send the link there'}
            </Button>
          </Row>
        </Form>
      ) : (
        <Row gap={3} align="center">
          <Button variant="secondary" disabled={busy} onClick={() => void resend()}>
            {busy ? 'Sending…' : 'Send it again'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setChanging(true)}>
            Use a different address
          </Button>
        </Row>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Row>
        <Button variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
      </Row>
    </Stack>
  )
}
