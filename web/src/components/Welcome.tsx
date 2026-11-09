import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import type { Group } from '../api'
import {
  useMembers,
  useMySettings,
  useRules,
  useSetMySettings,
  useSettings,
  useTopics,
  useWelcome,
} from '../data/hooks'
import { useLayout } from '../hooks/useLayout'
import { COMMUNITY } from '../routes'
import { tourSteps, type TourStep } from '../tour/steps'
import { Avatar, ConfirmDialog, Inset, Row, Stack, Text, Tour } from '../ui'
import { Body } from './Body'

interface WelcomeProps {
  root: Group
  /** Whether Home is showing. The dialog opens only there. */
  atHome: boolean
  /** True when Settings asked for the dialog with Show welcome. */
  asked: boolean
  /** Called when the dialog closes, so Home can forget the request. */
  onClosed: () => void
}

/**
 * The welcome dialog and the tour. The dialog opens the first time a user
 * sees Home, and again when they ask for it on Settings. It shows the welcome message under the owner's name and
 * offers the tour. Closing it either way records that the user has been welcomed.
 */
export function Welcome({ root, atHome, asked, onClosed }: WelcomeProps) {
  const mine = useMySettings().data
  const saveMine = useSetMySettings()
  const { settings } = useSettings()
  const welcome = useWelcome()
  const rules = useRules()
  const { topics } = useTopics()
  const { members } = useMembers(root.id)
  const { narrow, layout, setLayout, navExpanded, toggleNav } = useLayout()
  const [, navigate] = useLocation()
  const [closed, setClosed] = useState(false)
  const [steps, setSteps] = useState<TourStep[] | null>(null)

  const community = settings?.name || 'the community'
  const owner = members.find((m) => m.role === 'owner')?.user
  const open = atHome && steps === null && (asked || (mine !== undefined && !mine.welcomed && !closed))

  const close = (tour: boolean) => {
    setClosed(true)
    onClosed()
    if (mine && !mine.welcomed) void saveMine({ digest: mine.digest, welcomed: true })
    if (!tour) return
    // The tour describes the full layout: on a desktop, both columns and the expanded nav.
    if (!narrow && layout !== 'both') setLayout('both')
    if (!narrow && !navExpanded) toggleNav()
    setSteps(
      tourSteps({
        community,
        phone: narrow,
        owner: root.role === 'owner',
        canCreateRooms: root.can.create_groups === true,
        topic: topics[0]?.name,
        hasRules: !!rules,
      }),
    )
  }

  const cards = useMemo(() => steps ?? [], [steps])
  const before = (i: number) => {
    // On a phone the topic menu is in the posts view.
    if (narrow && cards[i]?.id === 'topics') setLayout('posts')
  }
  const end = (finished: boolean) => {
    const last = cards.at(-1)
    setSteps(null)
    if (finished && last?.id === 'welcome') navigate(`${COMMUNITY}?edit=welcome`)
  }

  return (
    <>
      <ConfirmDialog
        open={open}
        title={`Welcome to ${community}`}
        confirmLabel="Show me around"
        cancelLabel="Not now"
        focus="dialog"
        onConfirm={() => close(true)}
        onClose={() => close(false)}
      >
        <Text variant="small">{community} runs on Sweet.</Text>
        {welcome && (
          <Stack gap={2}>
            {/* The owner's picture and name, as an author line. It is not a control, because a card about the owner
                would open over the dialog. */}
            {owner && (
              <Row gap={2} align="center" wrap="never">
                <Avatar name={owner.username} picture={owner.picture} size="sm" decorative />
                <Text as="span" variant="name">
                  {owner.username}
                </Text>
              </Row>
            )}
            <Inset>
              <Body html={welcome} />
            </Inset>
          </Stack>
        )}
        <Text variant="small">Would you like a quick tour? You can start it again from Settings at any time.</Text>
      </ConfirmDialog>
      <Tour cards={cards} run={steps !== null} before={before} onEnd={end} />
    </>
  )
}
