import { useState } from 'react'
import { signinWithLink, type User } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Link, Row, Text } from '../ui'

interface SigninLinkProps {
  token: string
  /** The community's name, for the frame. */
  name?: string
  onSignedIn: (me: User) => void
}

/**
 * The page a sign-in link opens. Email security scanners open the links in a message, so
 * the token is used only when Finish signing in is pressed. The link works in any browser.
 */
export function SigninLink({ token, name, onSignedIn }: SigninLinkProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finish = async () => {
    if (busy) return
    setBusy(true)
    try {
      const session = await signinWithLink(token)
      onSignedIn(session.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That link does not work')
      setBusy(false)
    }
  }

  return (
    <AuthFrame name={name}>
      {error ? (
        <>
          <Alert tone="error">{error}</Alert>
          <Text variant="small">
            <Link href="/">Back to sign in</Link>
          </Text>
        </>
      ) : (
        <>
          <Text>This signs you in to {name || 'Sweet'} in this browser.</Text>
          <Row justify="end">
            <Button busy={busy} onClick={() => void finish()}>
              Finish signing in
            </Button>
          </Row>
        </>
      )}
    </AuthFrame>
  )
}
