import { useState } from 'react'
import type { Settings } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { CommunityForm } from '../components/CommunityForm'
import { useInviteActions, useInvites, useSettings } from '../data/hooks'
import { Button, Heading, Input, Row, Stack, Text } from '../ui'

interface WelcomeProps {
  settings: Settings
  /** Called when onboarding is finished. Navigates to the community. */
  onDone: () => void
}

/**
 * Onboarding (architecture.md, New-instance lifecycle). The newly set up
 * owner names the community and describes what it is for, then gets an
 * invite link for the first users. Ends on Home.
 */
export function Welcome({ settings: initial, onDone }: WelcomeProps) {
  // The current name. The form's save reaches the cache before the step changes.
  const { settings: live } = useSettings()
  const settings = live ?? initial
  const [named, setNamed] = useState(initial.name !== '')
  const { invites } = useInvites(named)
  const { create } = useInviteActions()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const link = invites[0]
  const url = link ? window.location.origin + link.url : ''

  const mint = async () => {
    setBusy(true)
    try {
      await create()
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // The clipboard is unavailable. The field is still selectable.
    }
  }

  return (
    <AuthFrame name={settings.name}>
      {named ? (
        <Stack gap={3}>
          <Heading level={2}>Invite people</Heading>
          <Text>
            Anyone with this link can join {settings.name} for the next seven days. After that, you can create a new
            link from the People page. You will receive a notification each time someone joins.
          </Text>
          {link ? (
            <Row gap={2} align="center">
              <Input value={url} readOnly selectOnFocus label="Invite link" />
              <Button variant="secondary" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </Row>
          ) : (
            <Row>
              <Button busy={busy} onClick={() => void mint()}>
                Create invite link
              </Button>
            </Row>
          )}
          <Row justify="end">
            <Button onClick={onDone}>Go to {settings.name}</Button>
          </Row>
        </Stack>
      ) : (
        <Stack gap={3}>
          <Heading level={2}>Community settings</Heading>
          <Text>This is your community. Give it a name, and say what it is for.</Text>
          <CommunityForm settings={settings} submitLabel="Next" onSaved={() => setNamed(true)} />
        </Stack>
      )}
    </AuthFrame>
  )
}
