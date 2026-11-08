import { useState } from 'react'
import { confirmEmail } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Link, Row, Text } from '../ui'

interface VerifyProps {
  token: string
  /** The community's name, for the frame. */
  name?: string
  /** Whether the person is signed in, which decides where the page leads afterwards. */
  signedIn: boolean
  /** Called once the address is confirmed. */
  onConfirmed?: () => void
}

/**
 * The page a link to confirm a changed address opens (architecture.md, Accounts). Email security scanners open the
 * links in a message, so the token is used only when Confirm address is pressed. Confirming signs nobody in.
 */
export function Verify({ token, name, signedIn, onConfirmed }: VerifyProps) {
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      setEmail((await confirmEmail(token)).email)
      onConfirmed?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That link does not work')
    } finally {
      setBusy(false)
    }
  }

  const onward = (
    <Text variant="small">
      {signedIn ? <Link href="/settings">Back to Settings</Link> : <Link href="/">Sign in</Link>}
    </Text>
  )
  return (
    <AuthFrame name={name}>
      {email ? (
        <>
          <Text>Your email address is now {email}.</Text>
          {onward}
        </>
      ) : error ? (
        <>
          <Alert tone="error">{error}</Alert>
          {onward}
        </>
      ) : (
        <>
          <Text>This confirms the new email address for your account.</Text>
          <Row justify="end">
            <Button busy={busy} onClick={() => void confirm()}>
              Confirm address
            </Button>
          </Row>
        </>
      )}
    </AuthFrame>
  )
}
