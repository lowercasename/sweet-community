import { useState } from 'react'
import { resetPassword, type User } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { RESET } from '../routes'
import { Alert, Button, Field, Form, Heading, Input, Link, Row, Text } from '../ui'

interface ResetPasswordProps {
  token: string
  /** The community's name, for the frame. */
  name?: string
  onReset: (me: User) => void
}

/** The page a reset link opens. The user sets a new password, every other session is ended, and this session is signed in. */
export function ResetPassword({ token, name, onReset }: ResetPasswordProps) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const session = await resetPassword(token, password)
      onReset(session.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame name={name}>
      <Heading level={2}>Choose a new password</Heading>
      <Form onSubmit={() => void submit()}>
        <Field label="New password">
          <Input
            type="password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            autoFocus
            required
          />
        </Field>
        <Text variant="small">At least 8 characters. Every other device will be signed out.</Text>
        {error && <Alert tone="error">{error}</Alert>}
        <Row justify="between" align="center">
          <Text as="span" variant="small">
            <Link href={RESET}>Ask for a new link</Link>
          </Text>
          <Button type="submit" disabled={password.length < 8} busy={busy}>
            Save
          </Button>
        </Row>
      </Form>
    </AuthFrame>
  )
}
