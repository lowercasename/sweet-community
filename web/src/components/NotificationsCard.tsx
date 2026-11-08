import { useEffect, useState } from 'react'
import { useMySettings, useSetMySettings } from '../data/hooks'
import { pushState, turnPushOff, turnPushOn, type PushState } from '../push'
import { Alert, Button, Card, Heading, Row, Stack, Text } from '../ui'

/**
 * What reaches me when I am away (architecture.md, Notifications): the
 * weekly email of what I missed, on until I turn it off, and this device,
 * for mentions and replies to my posts. Each toggle shows its state and,
 * under the pointer, the action.
 */
export function NotificationsCard() {
  const { data: settings, error } = useMySettings()
  const setSettings = useSetMySettings()
  const [busy, setBusy] = useState(false)
  const [overDigest, setOverDigest] = useState(false)
  const [overDevice, setOverDevice] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [device, setDevice] = useState<PushState | null>(null)

  useEffect(() => {
    let cancelled = false
    void pushState().then((s) => {
      if (!cancelled) setDevice(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setProblem(null)
    try {
      await fn()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  const digestOn = settings?.digest === 'weekly'
  const toggleDigest = () => run(() => setSettings({ digest: digestOn ? 'off' : 'weekly' }))
  const toggleDevice = () =>
    run(async () => {
      setDevice(await (device === 'on' ? turnPushOff() : turnPushOn()))
    })

  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2}>Notifications</Heading>
        {error && <Alert tone="error">{error.message}</Alert>}
        {problem && <Alert tone="error">{problem}</Alert>}
        <Stack gap={1}>
          <Text variant="secondary">
            An email when you have been away for a week, with what you missed: new posts and their topics, who joined,
            and replies to your posts.
          </Text>
          <Row>
            {settings && (
              <Button
                variant="ghost"
                icon="mail"
                pressed={digestOn}
                disabled={busy}
                onClick={() => void toggleDigest()}
                onHoverChange={setOverDigest}
              >
                {digestOn ? (overDigest ? 'Turn off' : 'Weekly digest on') : 'Send me a weekly digest'}
              </Button>
            )}
          </Row>
        </Stack>
        <Stack gap={1}>
          <Text variant="secondary">
            A notification on this device when someone mentions you or replies to your post.
          </Text>
          {device === 'unsupported' && <Text variant="small">This browser cannot show notifications.</Text>}
          {device === 'install-first' && (
            <Text variant="small">On an iPhone or iPad, add Sweet to your home screen first, then come back here.</Text>
          )}
          {device === 'denied' && (
            <Text variant="small">
              This browser is blocking notifications from Sweet. Allow them in its site settings, then come back here.
            </Text>
          )}
          {(device === 'on' || device === 'off') && (
            <Row>
              <Button
                variant="ghost"
                icon={device === 'on' ? (overDevice ? 'bell-off' : 'bell-ring') : 'bell'}
                pressed={device === 'on'}
                disabled={busy}
                onClick={() => void toggleDevice()}
                onHoverChange={setOverDevice}
              >
                {device === 'on' ? (overDevice ? 'Stop' : 'Notifying this device') : 'Notify this device'}
              </Button>
            </Row>
          )}
        </Stack>
      </Stack>
    </Card>
  )
}
