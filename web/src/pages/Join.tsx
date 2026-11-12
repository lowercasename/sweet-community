import { useEffect, useState } from 'react'
import { getInvite, register, type Settings, type User } from '../api'
import { AccountFields } from '../components/AccountFields'
import { AuthFrame } from '../components/AuthFrame'
import { CheckEmail } from '../components/CheckEmail'
import { Body } from '../components/Body'
import { Alert, Button, Form, Heading, Inset, Row, Stack, Text } from '../ui'

interface JoinProps {
  code: string
  /** The community's public settings. Undefined while they load. */
  community?: Settings
  onSignedIn: (me: User) => void
}

/**
 * The page an invite link opens. It shows who
 * invited the visitor and to which community. The visitor picks a username
 * and gives an email address. There is no password. The first sign-in email,
 * with a link and a code, finishes joining.
 */
export function Join({ code, community, onSignedIn }: JoinProps) {
  const [invitedBy, setInvitedBy] = useState<string | null>(null)
  const [rules, setRules] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getInvite(code)
      .then((r) => {
        if (!cancelled) {
          setInvitedBy(r.invited_by)
          setRules(r.rules_html)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setInvalid(e instanceof Error ? e.message : 'This invite link does not work')
      })
    return () => {
      cancelled = true
    }
  }, [code])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await register(code, username.trim(), email.trim())
      setSentTo(res.email)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  const name = community?.name || 'this community'
  return (
    <AuthFrame name={community?.name}>
      {invalid ? (
        <Text variant="secondary">{invalid}</Text>
      ) : sentTo ? (
        <CheckEmail
          login={sentTo}
          joinedWith={sentTo}
          onSignedIn={onSignedIn}
          backLabel="Back to the start"
          onBack={() => setSentTo(null)}
        />
      ) : (
        <Form onSubmit={() => void submit()}>
          <Heading level={2}>Create your account</Heading>
          <Text>{invitedBy ? `${invitedBy} invited you to ${name}.` : 'Checking your invite…'}</Text>
          {community?.description && <Text variant="secondary">{community.description}</Text>}
          <AccountFields username={username} onUsername={setUsername} email={email} onEmail={setEmail} />
          {rules && (
            <Stack gap={1}>
              <Text variant="small" weight="bold">
                The rules of {name}
              </Text>
              <Inset>
                <Body html={rules} />
              </Inset>
            </Stack>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <Row justify="end" align="center">
            <Button type="submit" disabled={!invitedBy || !username || !email} busy={busy}>
              {rules ? 'Agree and join' : `Join ${name}`}
            </Button>
          </Row>
        </Form>
      )}
    </AuthFrame>
  )
}
