import { useState } from 'react'
import { setup, type User } from '../api'
import { AccountFields } from '../components/AccountFields'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Form, Heading, Row, Text } from '../ui'

/** The number of steps in setting up a new community. The account is the first, and the welcome page has the others. */
export const SETUP_STEPS = 3

interface SetupProps {
  token: string
  onSetUp: (me: User) => void
}

/**
 * The setup link's page. A fresh instance has no owner until the holder of the link creates their account here. The
 * community has no name yet, so the page names its address. The email address is treated as verified, because holding
 * the link proves access to the server. There is no password, because a password is always the secondary way in. One
 * can be added on Settings later. The next step is "Set up your community".
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
      <Heading level={2} step={{ number: 1, total: SETUP_STEPS }}>
        Create your account
      </Heading>
      <Text variant="small">
        You are setting up a new Sweet community at {window.location.host}. Sweet is a private social network for one
        group of people.
      </Text>
      <Text variant="small">
        First, create your own account. You post and chat with it like everyone else. You will also be the community's
        owner. The owner looks after the community's settings, its rules, and invites new members.
      </Text>
      <Form onSubmit={() => void submit()}>
        <AccountFields username={username} onUsername={setUsername} email={email} onEmail={setEmail} />
        {error && <Alert tone="error">{error}</Alert>}
        <Row justify="end" align="center">
          <Button type="submit" disabled={!username || !email} busy={busy}>
            Create account
          </Button>
        </Row>
      </Form>
    </AuthFrame>
  )
}
