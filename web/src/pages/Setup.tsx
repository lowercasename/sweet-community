import { useState } from 'react'
import { setup, type User } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Field, Form, Heading, Input, Row } from '../ui'

interface SetupProps {
  token: string
  onSetUp: (me: User) => void
}

/**
 * The setup link's page (architecture.md, New-instance lifecycle). A fresh instance has no owner until the holder of
 * the link sets up their account here. The email address is treated as verified, because holding the link proves
 * access to the server. There is no password, because a password is always the secondary way in (Raphael,
 * 2026-11-09). One can be added on Settings later. The next step is "Set up your community".
 */
export function Setup({ token, onSetUp }: SetupProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const session = await setup(token, username.trim(), email.trim())
      onSetUp(session.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set up your account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame>
      <Heading level={2}>Set up your account</Heading>
      <Form onSubmit={() => void submit()}>
        <Field label="Username" hint="Letters, numbers, and underscores.">
          <Input name="username" value={username} onChange={setUsername} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Email address" hint="You will sign in with a link and a code sent here.">
          <Input type="email" name="email" value={email} onChange={setEmail} autoComplete="email" required />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Row justify="end" align="center">
          <Button type="submit" disabled={!username || !email} busy={busy}>
            Set up
          </Button>
        </Row>
      </Form>
    </AuthFrame>
  )
}
