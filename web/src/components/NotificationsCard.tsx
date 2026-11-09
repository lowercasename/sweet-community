import { useEffect, useState } from 'react'
import { useMySettings, useSetMySettings } from '../data/hooks'
import { pushState, turnPushOff, turnPushOn, type PushState } from '../push'
import { ActionRow, ActionRows, Alert, Button, Card, Heading, Stack } from '../ui'

/**
 * The settings for notifications sent while the user is away. These are the weekly email summarising what the user
 * missed, which is on until the user turns it off, and push notifications to
 * this device for mentions, replies to the user's posts and messages. Each is
 * an action row. Each toggle shows its state,
 * and shows its action on hover.
 */
export function NotificationsCard() {
  const { data: settings, error } = useMySettings()
  const setSettings = useSetMySettings()
  const [working, setWorking] = useState<'digest' | 'device' | null>(null)
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

  const run = async (which: 'digest' | 'device', fn: () => Promise<void>) => {
    setWorking(which)
    setProblem(null)
    try {
      await fn()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setWorking(null)
    }
  }
  const digestOn = settings?.digest === 'weekly'
  const toggleDigest = () => run('digest', () => setSettings({ digest: digestOn ? 'off' : 'weekly' }))
  const toggleDevice = () =>
    run('device', async () => {
      setDevice(await (device === 'on' ? turnPushOff() : turnPushOn()))
    })
  // Why this device cannot be notified, when it cannot. The row then shows this and no button.
  const deviceReason =
    device === 'unsupported'
      ? 'This browser cannot show notifications.'
      : device === 'install-first'
        ? 'On an iPhone or iPad, add Sweet to your home screen first, then come back here.'
        : device === 'denied'
          ? 'This browser is blocking notifications from Sweet. Allow them in its site settings, then come back here.'
          : null

  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2}>Notifications</Heading>
        {error && <Alert tone="error">{error.message}</Alert>}
        {problem && <Alert tone="error">{problem}</Alert>}
        <ActionRows>
          <ActionRow
            title="Weekly digest"
            action={
              settings && (
                <Button
                  variant="ghost"
                  icon="mail"
                  pressed={digestOn}
                  disabled={working !== null}
                  busy={working === 'digest'}
                  onClick={() => void toggleDigest()}
                  onHoverChange={setOverDigest}
                  labels={['Send me a weekly digest', 'Weekly digest on', 'Turn weekly digest off']}
                >
                  {digestOn ? (overDigest ? 'Turn weekly digest off' : 'Weekly digest on') : 'Send me a weekly digest'}
                </Button>
              )
            }
          >
            An email sent when you haven't visited for a week, with a summary of what you missed.
          </ActionRow>
          <ActionRow
            title="Push notifications"
            action={
              (device === 'on' || device === 'off') && (
                <Button
                  variant="ghost"
                  icon={device === 'on' ? (overDevice ? 'bell-off' : 'bell-ring') : 'bell'}
                  pressed={device === 'on'}
                  disabled={working !== null}
                  busy={working === 'device'}
                  onClick={() => void toggleDevice()}
                  onHoverChange={setOverDevice}
                  labels={['Notify this device', 'Notifying this device', 'Stop notifying this device']}
                >
                  {device === 'on'
                    ? overDevice
                      ? 'Stop notifying this device'
                      : 'Notifying this device'
                    : 'Notify this device'}
                </Button>
              )
            }
          >
            {deviceReason ??
              'Receive notifications on this device when someone mentions you, replies to your post or messages you.'}
          </ActionRow>
        </ActionRows>
      </Stack>
    </Card>
  )
}
