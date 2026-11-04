import { useEffect, useState } from 'react'
import { createInvite, listInvites, listUsers, revokeInvite, type Invite, type Member, type User } from '../api'
import { Avatar, Button, Card, Heading, Input, Measure, Pane, Row, ScrollArea, Stack, Text, Time } from '../ui'

interface PeoplePageProps {
  me: User
}

function InviteRow({ invite, onRevoke }: { invite: Invite; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = window.location.origin + invite.url
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (http, permissions); the field is selectable
    }
  }
  return (
    <Stack gap={1}>
      <Row gap={2} align="center">
        <Input value={url} readOnly selectOnFocus />
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="ghost" onClick={onRevoke}>
          Revoke
        </Button>
      </Row>
      <Text variant="small">
        Expires <Time at={invite.expires_at} />
      </Text>
    </Stack>
  )
}

/** Everyone on the instance; the owner also mints invite links here. */
export function PeoplePage({ me }: PeoplePageProps) {
  const [users, setUsers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [error, setError] = useState<string | null>(null)
  const owner = me.role === 'owner'

  useEffect(() => {
    let cancelled = false
    const loads: Promise<void>[] = [listUsers().then((r) => void (cancelled || setUsers(r.users)))]
    if (owner) loads.push(listInvites().then((r) => void (cancelled || setInvites(r.invites))))
    Promise.all(loads).catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load')
    })
    return () => {
      cancelled = true
    }
  }, [owner])

  const invite = async () => {
    try {
      const inv = await createInvite()
      setInvites((prev) => [inv, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite')
    }
  }

  const revoke = async (code: string) => {
    await revokeInvite(code)
    setInvites((prev) => prev.filter((i) => i.code !== code))
  }

  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            {owner && (
              <Card>
                <Stack gap={2}>
                  <Heading level={2}>Invite someone</Heading>
                  <Text variant="secondary">A link works once and for seven days. Send it however you like.</Text>
                  <Row>
                    <Button onClick={() => void invite()}>Create invite link</Button>
                  </Row>
                  {invites.map((inv) => (
                    <InviteRow key={inv.code} invite={inv} onRevoke={() => void revoke(inv.code)} />
                  ))}
                </Stack>
              </Card>
            )}
            <Card>
              <Stack gap={2}>
                <Heading level={2}>People</Heading>
                {error && <Text variant="secondary">{error}</Text>}
                {users.map((u) => (
                  <Row key={u.id} gap={2} align="center">
                    <Avatar name={u.username} picture={u.picture} />
                    <Text as="span" variant="name">
                      {u.username}
                    </Text>
                    <Text as="span" variant="small">
                      {u.role === 'owner' ? 'runs this place · ' : ''}joined <Time at={u.created_at} />
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
