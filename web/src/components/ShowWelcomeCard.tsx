import { useLocation } from 'wouter'
import { useSettings } from '../data/hooks'
import { ActionRow, ActionRows, Button, Card, Heading, Stack } from '../ui'

/** Opens the welcome dialog again, on Settings (architecture.md, New-instance lifecycle). */
export function ShowWelcomeCard() {
  const { settings } = useSettings()
  const [, navigate] = useLocation()
  const community = settings?.name || 'the community'
  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2}>Welcome</Heading>
        <ActionRows>
          <ActionRow
            action={
              <Button variant="secondary" onClick={() => navigate('/?welcome')}>
                Show welcome
              </Button>
            }
          >
            Read {community}&apos;s welcome message again, or take the tour.
          </ActionRow>
        </ActionRows>
      </Stack>
    </Card>
  )
}
