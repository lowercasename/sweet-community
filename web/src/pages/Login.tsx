import { useState } from 'react'
import { ApiError, login, requestSignin, type Settings, type User } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { CheckEmail } from '../components/CheckEmail'
import { Alert, Button, Field, Form, Input, Link, Row, Text } from '../ui'

interface LoginProps {
  community?: Settings
  onSignedIn: (me: User) => void
}

/**
 * The sign-in page (architecture.md, Accounts). The usual way in is a sign-in email with a link and a code. A
 * password is optional, so Use a password instead shows a password field. An account whose address is not verified
 * yet is sent a sign-in email instead, because using it verifies the address.
 */
export function Login({ community, onSignedIn }: LoginProps) {
  const [who, setWho] = useState('')
  const [password, setPassword] = useState('')
  const [withPassword, setWithPassword] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }
  const sendEmail = () =>
    run(async () => {
      await requestSignin(who.trim())
      setSent(true)
    })
  const signInWithPassword = () =>
    run(async () => {
      try {
        const session = await login(who.trim(), password)
        onSignedIn(session.user)
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 403 && e.message === 'unverified')) throw e
        await requestSignin(who.trim())
        setSent(true)
      }
    })

  return (
    <AuthFrame name={community?.name}>
      {community && !community.owner_set ? (
        <Text variant="secondary">This community has not been set up yet.</Text>
      ) : sent ? (
        <CheckEmail
          login={who.trim()}
          onSignedIn={onSignedIn}
          backLabel="Back to sign in"
          onBack={() => setSent(false)}
        />
      ) : (
        <>
          <Form onSubmit={() => void (withPassword ? signInWithPassword() : sendEmail())}>
            <Field
              label="Username or email address"
              hint={withPassword ? undefined : 'A link and a code to sign in will be sent to your email address.'}
            >
              <Input name="username" value={who} onChange={setWho} autoComplete="username" autoFocus required />
            </Field>
            {withPassword && (
              <Field label="Password">
                <Input
                  type="password"
                  name="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  required
                />
              </Field>
            )}
            {error && <Alert tone="error">{error}</Alert>}
            <Row justify="end">
              <Button type="submit" disabled={!who.trim() || (withPassword && !password)} busy={busy}>
                {withPassword ? 'Sign in' : 'Send a sign-in email'}
              </Button>
            </Row>
          </Form>
          <Text variant="small">
            <Link
              onClick={() => {
                setWithPassword(!withPassword)
                setError(null)
              }}
            >
              {withPassword ? 'Use a sign-in email instead' : 'Use a password instead'}
            </Link>
          </Text>
        </>
      )}
    </AuthFrame>
  )
}
