import type { Group } from '../api'
import { useSettings } from '../data/hooks'
import { Alert, Card, Heading, Measure, Pane, ScrollArea, PageNote, ShieldMark, shieldText, Stack } from '../ui'
import { CommunityForm } from './CommunityForm'
import { ReportsCard } from './ReportsCard'
import { RulesCard, WelcomeCard } from './CommunityTextCard'
import { TopicsCard } from './TopicsCard'

/**
 * The page for the community's reports, settings, welcome message, rules and topics. It is linked from the nav, not
 * from the owner's profile page. The reports come first, because they wait for someone to act on
 * them. A moderator sees the reports, the welcome message, the rules and the topics, and not the community's settings.
 * The root group's flags decide which cards show. `editing` opens the welcome message in the
 * editor, for the tour's last step for the owner.
 */
export function CommunityPage({ root, editing }: { root: Group; editing?: 'welcome' }) {
  const { settings, error } = useSettings()
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            {/* The page says once what the shield means. Every card here carries it. */}
            <PageNote>
              The shield <ShieldMark size={14} inline /> marks what only owners and moderators can see and do.
            </PageNote>
            {root.can.handle_reports && <ReportsCard />}
            {root.can.manage_instance && (
              <Card>
                <Stack gap={2}>
                  <Heading level={2} shield={shieldText.ownerSees}>
                    About this community
                  </Heading>
                  {error && <Alert tone="error">{error.message}</Alert>}
                  {settings && <CommunityForm settings={settings} submitLabel="Save" />}
                </Stack>
              </Card>
            )}
            {root.can.manage_welcome && <WelcomeCard editing={editing === 'welcome'} />}
            {root.can.manage_rules && <RulesCard />}
            {root.can.manage_topics && <TopicsCard />}
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
