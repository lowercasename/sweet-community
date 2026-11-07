import { useSettings } from '../data/hooks'
import { Alert, Card, Heading, Measure, Pane, ScrollArea, Stack } from '../ui'
import { CommunityForm } from './CommunityForm'
import { TopicsCard } from './TopicsCard'

/** The owner's page for the community itself: in the nav, not behind the owner's own page (Raphael, 2026-11-06). */
export function CommunityPage() {
  const { settings, error } = useSettings()
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            <Card>
              <Stack gap={2}>
                <Heading level={2}>About this community</Heading>
                {error && <Alert tone="error">{error.message}</Alert>}
                {settings && <CommunityForm settings={settings} submitLabel="Save" />}
              </Stack>
            </Card>
            <TopicsCard />
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
