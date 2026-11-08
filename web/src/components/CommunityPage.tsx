import type { Group } from '../api'
import { useSettings } from '../data/hooks'
import { Alert, Card, Heading, Measure, Pane, ScrollArea, Stack } from '../ui'
import { CommunityForm } from './CommunityForm'
import { TopicsCard } from './TopicsCard'

/**
 * The page for the community's settings and topics. It is linked from the
 * nav, not from the owner's profile page (Raphael, 2026-11-06). The owner sees
 * both. A moderator sees only the topics, which moderators may manage too
 * (Raphael, 2026-11-08). The root group's flags decide which cards show.
 */
export function CommunityPage({ root }: { root: Group }) {
  const { settings, error } = useSettings()
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            {root.can.manage_instance && (
              <Card>
                <Stack gap={2}>
                  <Heading level={2}>About this community</Heading>
                  {error && <Alert tone="error">{error.message}</Alert>}
                  {settings && <CommunityForm settings={settings} submitLabel="Save" />}
                </Stack>
              </Card>
            )}
            {root.can.manage_topics && <TopicsCard />}
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
