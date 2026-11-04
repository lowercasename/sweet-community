import { useState } from 'react'
import { logoutEverywhere } from '../api'
import { Button, Card, Heading, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'

interface SettingsPageProps {
  /** After every session has been ended. */
  onSignOut: () => void
  /** Sign out of this session only. */
  onLogout: () => void
}

export function SettingsPage({ onSignOut, onLogout }: SettingsPageProps) {
  const [busy, setBusy] = useState(false)
  const everywhere = async () => {
    setBusy(true)
    await logoutEverywhere()
    onSignOut()
  }
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            <Stack gap={2}>
              <Heading level={2}>Sign out</Heading>
              <Text variant="secondary">
                If you have lost a device or think someone else has access to your account, sign out everywhere, which
                will end every logged in session including this one.
              </Text>
              <Row>
                <Button variant="secondary" disabled={busy} icon="logout" onClick={onLogout}>
                  Sign out here
                </Button>
                <Button variant="secondary" disabled={busy} icon="devices" onClick={() => void everywhere()}>
                  {busy ? 'Signing out…' : 'Sign out everywhere'}
                </Button>
              </Row>
            </Stack>
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
