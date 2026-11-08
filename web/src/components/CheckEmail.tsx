import { useState } from 'react'
import { changeJoiningAddress, requestSignin, signinWithCode, type User } from '../api'
import { Alert, Button, Field, Form, Heading, Input, Link, Row, Stack, Text } from '../ui'

interface CheckEmailProps {
  /** The username or address the email was asked for. Send another email asks for it again. */
  login: string
  /**
   * The address the email went to, after joining. It is shown, and it can be changed for a mistyped address. After a
   * sign-in request there is none, because the page does not reveal whether an account matched.
   */
  joinedWith?: string
  onSignedIn: (me: User) => void
  /** Returns to the previous screen, which is the sign-in page or the join form. */
  backLabel: string
  onBack: () => void
}

/**
 * The screen shown after a sign-in email is sent (architecture.md, Accounts). The email holds a link and a six-digit
 * code. The code is typed here, and it works only in this browser. That is what signs in a web app on an iPhone's
 * home screen, which does not share sign-in with Safari.
 */
export function CheckEmail({ login, joinedWith, onSignedIn, backLabel, onBack }: CheckEmailProps) {
  const [address, setAddress] = useState(joinedWith)
  const [code, setCode] = useState('')
  const [changing, setChanging] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentAgain, setSentAgain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const digits = code.replace(/\s/g, '')

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  const submitCode = () =>
    run(async () => {
      const session = await signinWithCode(code)
      onSignedIn(session.user)
    })
  const sendAgain = () =>
    run(async () => {
      await requestSignin(address ?? login)
      setSentAgain(true)
    })
  const change = () =>
    run(async () => {
      await changeJoiningAddress(newAddress.trim())
      setAddress(newAddress.trim())
      setNewAddress('')
      setChanging(false)
      setSentAgain(false)
    })

  return (
    <Stack gap={3}>
      <Heading level={2}>Check your email</Heading>
      {address ? (
        <Text>
          An email is on its way to{' '}
          <Text as="span" weight="bold">
            {address}
          </Text>
          . Open the link or type the code here to finish joining.
        </Text>
      ) : (
        <Text>
          If that account exists, an email with a link and a code is on its way to you. Open the link or type the code
          here to sign in.
        </Text>
      )}
      {changing ? (
        <Form onSubmit={() => void change()}>
          <Field label="Email address">
            <Input
              type="email"
              name="email"
              value={newAddress}
              onChange={setNewAddress}
              autoComplete="email"
              autoFocus
              required
            />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Row justify="end" gap={2}>
            <Button variant="ghost" disabled={busy} onClick={() => setChanging(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!newAddress.trim()} busy={busy}>
              Send to this address
            </Button>
          </Row>
        </Form>
      ) : (
        <Form onSubmit={() => void submitCode()}>
          <Field label="Code">
            <Input
              name="code"
              value={code}
              onChange={setCode}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              autoFocus
              required
            />
          </Field>
          {sentAgain && <Alert>Sent again. Check your spam folder if it doesn't arrive.</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <Row justify="end">
            <Button type="submit" disabled={digits.length !== 6} busy={busy}>
              {joinedWith ? 'Finish joining' : 'Sign in'}
            </Button>
          </Row>
        </Form>
      )}
      <Stack gap={1}>
        <Text variant="small">
          Didn't get it? <Link onClick={() => void sendAgain()}>Send another email</Link>
        </Text>
        {joinedWith && !changing && (
          <Text variant="small">
            Mistyped your address? <Link onClick={() => setChanging(true)}>Use a different address</Link>
          </Text>
        )}
        <Text variant="small">
          <Link onClick={onBack}>{backLabel}</Link>
        </Text>
      </Stack>
    </Stack>
  )
}
