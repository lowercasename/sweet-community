import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { removePassword, setPassword } from '../api'
import { useAccount, useChangeEmail, useSetUsername } from '../data/hooks'
import { keys } from '../data/keys'
import { Alert, Button, Card, ConfirmDialog, Field, Form, Heading, Input, Row, Stack, Text } from '../ui'
import { UsernameField } from './AccountFields'

/**
 * The user's username, email address and password. A new username takes effect at once. A new address stays pending
 * until the link sent to it is used. A password is optional. Setting, changing and removing it ask for no current password, because the
 * account's email can always sign in. Each one signs out every other device and emails a notice.
 */
export function AccountCard({ username: current }: { username: string }) {
  const qc = useQueryClient()
  const { data: account, error } = useAccount()
  const changeEmail = useChangeEmail()
  const setUsername = useSetUsername()
  const [username, setUsernameValue] = useState('')
  const [usernameBusy, setUsernameBusy] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [password, setPasswordValue] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordNote, setPasswordNote] = useState<{ tone: 'notice' | 'error'; text: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const hasPassword = account?.has_password === true

  const submitUsername = async () => {
    if (usernameBusy) return
    setUsernameBusy(true)
    setUsernameError(null)
    try {
      // The new name is shown above the field and in the nav, which confirms the change.
      await setUsername(username.trim())
      setUsernameValue('')
    } catch (e) {
      setUsernameError(e instanceof Error ? e.message : 'Could not change the username')
    } finally {
      setUsernameBusy(false)
    }
  }
  const submitEmail = async () => {
    if (emailBusy) return
    setEmailBusy(true)
    setEmailError(null)
    try {
      await changeEmail(email.trim())
      setEmail('')
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : 'Could not change the address')
    } finally {
      setEmailBusy(false)
    }
  }
  // Sets, changes or removes the password, then refetches the account, which says whether there is one.
  const changePassword = async (work: () => Promise<void>, done: string) => {
    if (passwordBusy) return
    setPasswordBusy(true)
    setPasswordNote(null)
    try {
      await work()
      setPasswordValue('')
      setRemoving(false)
      setPasswordNote({ tone: 'notice', text: done })
      void qc.invalidateQueries({ queryKey: keys.account })
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
          <Heading level={2}>Username</Heading>
          <Text>
            <Text as="span" weight="bold">
              {current}
            </Text>
          </Text>
          <Text variant="small">
            Anyone can take your old username after you change it. Links using that name will then lead to their
            profile.
          </Text>
          <Form onSubmit={() => void submitUsername()}>
            <UsernameField label="New username" value={username} onChange={setUsernameValue} />
            {usernameError && <Alert tone="error">{usernameError}</Alert>}
            <Row justify="end">
              <Button type="submit" disabled={!username.trim() || username.trim() === current} busy={usernameBusy}>
                Change username
              </Button>
            </Row>
          </Form>
        </Stack>
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
            <Alert>A link has been sent to {account.pending_email}. Open it to confirm the new address.</Alert>
          )}
          <Form onSubmit={() => void submitEmail()}>
            <Field label={account?.email ? 'New email address' : 'Email address'}>
              <Input type="email" name="email" value={email} onChange={setEmail} autoComplete="email" required />
            </Field>
            {emailError && <Alert tone="error">{emailError}</Alert>}
            <Row justify="end">
              <Button type="submit" disabled={!email.trim()} busy={emailBusy}>
                Change email address
              </Button>
            </Row>
          </Form>
        </Stack>
        <Stack gap={2}>
          <Heading level={2}>Password</Heading>
          {account && (
            <Text variant="small">
              {hasPassword
                ? 'You can sign in with your password or by email.'
                : 'You sign in by email, with a link and a code. A password is optional.'}
            </Text>
          )}
          <Form
            onSubmit={() =>
              void changePassword(
                () => setPassword(password),
                hasPassword
                  ? 'Password changed. Every other device has been signed out.'
                  : 'Password set. Every other device has been signed out.',
              )
            }
          >
            <Field
              label={hasPassword ? 'New password' : 'Password'}
              hint="At least 8 characters. Every other device will be signed out."
            >
              <Input
                type="password"
                name="password"
                value={password}
                onChange={setPasswordValue}
                autoComplete="new-password"
                required
              />
            </Field>
            {passwordNote && <Alert tone={passwordNote.tone}>{passwordNote.text}</Alert>}
            <Row justify="end">
              <Button type="submit" disabled={password.length < 8} busy={passwordBusy && !removing}>
                {hasPassword ? 'Change password' : 'Set password'}
              </Button>
            </Row>
          </Form>
          {hasPassword && account?.email_verified && (
            <Row>
              <Button variant="danger" icon="remove" disabled={passwordBusy} onClick={() => setRemoving(true)}>
                Remove password
              </Button>
            </Row>
          )}
        </Stack>
      </Stack>
      <ConfirmDialog
        open={removing}
        title="Remove your password?"
        confirmLabel="Remove password"
        icon="remove"
        busy={passwordBusy}
        onConfirm={() =>
          void changePassword(
            removePassword,
            'Password removed. You now sign in by email. Every other device has been signed out.',
          )
        }
        onClose={() => setRemoving(false)}
      >
        <Text variant="secondary">
          You will sign in by email, with a link and a code sent to {account?.email}. Every other device will be signed
          out.
        </Text>
      </ConfirmDialog>
    </Card>
  )
}
