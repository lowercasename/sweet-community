import { useState } from 'react'
import { changePassword } from '../api'
import { useAccount, useChangeEmail } from '../data/hooks'
import { Alert, Button, Card, Field, Form, Heading, Input, Row, Stack, Text } from '../ui'

/**
 * My address and password (architecture.md, Accounts). A new address waits,
 * pending, until the link sent to it is opened; a new password wants the old
 * one and ends every other session.
 */
export function AccountCard() {
  const { data: account, error } = useAccount()
  const changeEmail = useChangeEmail()
  const [email, setEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordNote, setPasswordNote] = useState<{ tone: 'notice' | 'error'; text: string } | null>(null)

  const submitEmail = async () => {
    if (emailBusy) return
    setEmailBusy(true)
    setEmailError(null)
    try {
      await changeEmail(email.trim(), emailPassword)
      setEmail('')
      setEmailPassword('')
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : 'Could not change the address')
    } finally {
      setEmailBusy(false)
    }
  }
  const submitPassword = async () => {
    if (passwordBusy) return
    setPasswordBusy(true)
    setPasswordNote(null)
    try {
      await changePassword(current, password)
      setCurrent('')
      setPassword('')
      setPasswordNote({ tone: 'notice', text: 'Password changed. Every other device has been signed out.' })
    } catch (e) {
      setPasswordNote({ tone: 'error', text: e instanceof Error ? e.message : 'Could not change the password' })
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <Card>
      <Stack gap={3}>
        <Stack gap={2}>
          <Heading level={2}>Email address</Heading>
          {error && <Alert tone="error">{error.message}</Alert>}
          {account &&
            (account.email ? (
              <Text>
                <Text as="span" weight="bold">
                  {account.email}
                </Text>
                {!account.email_verified && ' (not verified yet)'}
              </Text>
            ) : (
              <Text variant="secondary">No email address yet.</Text>
            ))}
          {account?.pending_email && (
            <Alert>A link is on its way to {account.pending_email}. Open it to confirm the new address.</Alert>
          )}
          <Form onSubmit={() => void submitEmail()}>
            <Field label={account?.email ? 'New email address' : 'Email address'}>
              <Input type="email" name="email" value={email} onChange={setEmail} autoComplete="email" required />
            </Field>
            <Field label="Your password">
              <Input
                type="password"
                name="email-password"
                value={emailPassword}
                onChange={setEmailPassword}
                autoComplete="current-password"
                required
              />
            </Field>
            {emailError && <Alert tone="error">{emailError}</Alert>}
            <Row justify="end">
              <Button type="submit" variant="secondary" disabled={emailBusy || !email.trim() || !emailPassword}>
                {emailBusy ? 'Sending…' : 'Send a link there'}
              </Button>
            </Row>
          </Form>
        </Stack>
        <Stack gap={2}>
          <Heading level={2}>Password</Heading>
          <Form onSubmit={() => void submitPassword()}>
            <Field label="Current password">
              <Input
                type="password"
                name="current"
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password">
              <Input
                type="password"
                name="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                required
              />
            </Field>
            <Text variant="small">At least 8 characters. Every other device will be signed out.</Text>
            {passwordNote && <Alert tone={passwordNote.tone}>{passwordNote.text}</Alert>}
            <Row justify="end">
              <Button type="submit" variant="secondary" disabled={passwordBusy || !current || password.length < 8}>
                {passwordBusy ? 'Saving…' : 'Change password'}
              </Button>
            </Row>
          </Form>
        </Stack>
      </Stack>
    </Card>
  )
}
