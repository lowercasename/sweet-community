import { useState } from 'react'
import { logoutEverywhere } from '../api'
import { Button, Card, Heading, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'

interface SettingsPageProps {
  onSignOut: () => void
}

export function SettingsPage({ onSignOut }: SettingsPageProps) {
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
              <Heading level={2}>Sessions</Heading>
              <Text variant="secondary">
                You stay signed in for 180 days on each device. If you have lost a phone or think someone else has your
                password, sign out everywhere; it ends every session, this one included.
              </Text>
              <Row>
                <Button variant="secondary" disabled={busy} onClick={() => void everywhere()}>
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
