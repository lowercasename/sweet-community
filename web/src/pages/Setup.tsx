import { useState } from 'react'
import { setup, type User } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Field, Form, Heading, Input, Row } from '../ui'

interface SetupProps {
  token: string
  onSetUp: (me: User) => void
}

/**
 * The setup link's page (architecture.md, New-instance lifecycle). A fresh
 * instance has no owner until the holder of the link creates their account
 * here. The email address is treated as verified, because holding the link
 * proves access to the mailbox. The password is optional (architecture.md,
 * Accounts).
 */
export function Setup({ token, onSetUp }: SetupProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const session = await setup(token, username.trim(), email.trim(), password)
      onSetUp(session.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set up the community')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame>
      <Heading level={2}>Set up your community</Heading>
      <Form onSubmit={() => void submit()}>
        <Field label="Username" hint="Letters, digits and underscores.">
          <Input name="username" value={username} onChange={setUsername} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Email address">
          <Input type="email" name="email" value={email} onChange={setEmail} autoComplete="email" required />
        </Field>
        <Field label="Password" hint="Optional, at least 8 characters. Without one, you sign in by email.">
          <Input type="password" name="password" value={password} onChange={setPassword} autoComplete="new-password" />
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
