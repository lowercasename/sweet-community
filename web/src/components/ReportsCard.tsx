import { useState } from 'react'
import { useLocation } from 'wouter'
import type { Report, ReportKind } from '../api'
import { useCloseReport, useGroupActions, useReports } from '../data/hooks'
import { ROOT_ID } from '../data/keys'
import { groupPath, postPath } from '../routes'
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Hairline,
  Heading,
  Inset,
  List,
  ListItem,
  Row,
  shieldText,
  Stack,
  Text,
  Time,
} from '../ui'
import { Body } from './Body'
import { PersonName } from './PersonName'

const NOUN: Record<ReportKind, string> = { post: 'post', comment: 'comment', message: 'message' }
const TITLE: Record<ReportKind, string> = { post: 'Post', comment: 'Comment', message: 'Message' }

/**
 * Where the item is: Home for the community's own feed and chat, a room's name, or a conversation. A deleted room's
 * name has been emptied.
 */
function placeOf(r: Report): string {
  if (r.group_kind === 'root') return 'Home'
  if (r.group_kind === 'dm') return 'a conversation'
  return r.group_name || 'a deleted room'
}

/** The path that opens the item: a post's page, the page of a comment's post, or a chat at its message. */
function pathOf(r: Report): string {
  if (r.kind === 'post') return postPath(r.id)
  if (r.kind === 'comment' && r.post_id) return postPath(r.post_id)
  return `${groupPath(r.group_id, ROOT_ID)}?message=${encodeURIComponent(r.id)}`
}

/**
 * One reported item. The author and place come first, then the copy of the body kept by the first report, then each
 * report. The buttons follow, from the least to the most consequential: Open and Message
 * on the left, then Dismiss report and Delete at the right end. The resolving pair wraps onto its own line at the
 * right on a phone.
 */
function ReportEntry({ report, first }: { report: Report; first: boolean }) {
  const close = useCloseReport()
  const { openDM } = useGroupActions()
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState<'dismiss' | 'delete' | 'message' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noun = NOUN[report.kind]

  const act = async (what: 'dismiss' | 'delete' | 'message', work: () => Promise<void>) => {
    setBusy(what)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setConfirming(false)
    } finally {
      setBusy(null)
    }
  }
  const message = () =>
    act('message', async () => {
      navigate(groupPath((await openDM(report.author.id)).id))
    })

  return (
    <ListItem>
      <Stack gap={3}>
        {!first && <Hairline />}
        <Stack gap={2}>
          <Row gap={2} align="center">
            <PersonName user={report.author} avatar="md" />
            <Text as="span" variant="small">
              {`${TITLE[report.kind]} in ${placeOf(report)}`}
            </Text>
          </Row>
          <Inset>
            <Body html={report.body_html} />
          </Inset>
          {report.deleted && <Text variant="small">{`The ${noun} has since been deleted.`}</Text>}
        </Stack>
        <Stack gap={2}>
          {report.reports.map((r) => (
            <Stack key={r.id} gap={0}>
              <Text variant="small">
                <Time at={r.created_at} />
              </Text>
              {r.reason && <Text>{r.reason}</Text>}
            </Stack>
          ))}
        </Stack>
        {error && <Alert tone="error">{error}</Alert>}
        <Row gap={2} align="center">
          {report.can.open && (
            <Button variant="secondary" onClick={() => navigate(pathOf(report))}>
              Open
            </Button>
          )}
          <Button variant="secondary" icon="chat" busy={busy === 'message'} onClick={() => void message()}>
            Message author
          </Button>
          <Row gap={2} align="center" push="end" shrink={false}>
            <Button
              variant="secondary"
              busy={busy === 'dismiss'}
              disabled={busy !== null && busy !== 'dismiss'}
              onClick={() => void act('dismiss', () => close(report.kind, report.id, 'dismiss'))}
            >
              Dismiss report
            </Button>
            {!report.deleted && (
              <Button variant="danger" icon="trash" disabled={busy !== null} onClick={() => setConfirming(true)}>
                {`Delete ${noun}`}
              </Button>
            )}
          </Row>
        </Row>
      </Stack>
      <ConfirmDialog
        open={confirming}
        title={`Delete this ${noun}?`}
        confirmLabel={`Delete ${noun}`}
        icon="trash"
        busy={busy === 'delete'}
        onConfirm={() => void act('delete', () => close(report.kind, report.id, 'delete'))}
        onClose={() => setConfirming(false)}
      >
        <Text variant="secondary">
          {report.kind === 'post'
            ? 'This will also delete all the comments made on this post. This action cannot be undone.'
            : 'This action cannot be undone.'}
        </Text>
      </ConfirmDialog>
    </ListItem>
  )
}

/**
 * The Reports card on the Community page, for the owner and moderators. It lists one
 * entry per reported item, the item with the newest report first. Report events keep it current.
 */
export function ReportsCard() {
  const { reports, loading, error } = useReports()
  return (
    <Card>
      <Stack gap={3}>
        <Stack gap={2}>
          <Heading level={2} shield={shieldText.staffSee}>
            Reports
          </Heading>
          <Text variant="small">
            Posts, comments and messages that members reported. Only the owner and moderators see them.
          </Text>
          {error && <Alert tone="error">{error.message}</Alert>}
          {!loading && !error && reports.length === 0 && <Text variant="small">Nothing has been reported.</Text>}
        </Stack>
        {reports.length > 0 && (
          <List gap={3}>
            {reports.map((r, i) => (
              <ReportEntry key={`${r.kind}:${r.id}`} report={r} first={i === 0} />
            ))}
          </List>
        )}
      </Stack>
    </Card>
  )
}
