import { useState, useSyncExternalStore } from 'react'
import { install, installWay, subscribeInstall } from '../install'
import { Alert, Button, Row, Stack, Strip, Text } from '../ui'

const DISMISSED = 'sweet.install'
const QUIET_FOR = 30 * 24 * 60 * 60 * 1000

/** Whether Not now was chosen in this browser in the last 30 days. Storage can be unavailable, and then it was not. */
function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED))
    return at > 0 && Date.now() - at < QUIET_FOR
  } catch {
    return false
  }
}

/**
 * The offer to add the community to the home screen, at the top of Home (architecture.md, Mobile). It shows only on
 * a touch screen that can add it and has not, because on an iPhone push works only in the added app. Where the
 * browser has an install dialog, the button opens it. On an iPhone or iPad the strip says where Add to Home Screen
 * is. Not now hides it in this browser for 30 days.
 */
export function InstallPrompt({ name }: { name: string }) {
  const way = useSyncExternalStore(subscribeInstall, installWay)
  const [hidden, setHidden] = useState(dismissedRecently)
  const [busy, setBusy] = useState(false)
  const touch = window.matchMedia?.('(pointer: coarse)').matches === true
  if (hidden || !touch || (way !== 'dialog' && way !== 'ios')) return null

  const notNow = () => {
    try {
      localStorage.setItem(DISMISSED, String(Date.now()))
    } catch {
      // Without storage it is hidden until the page is loaded again.
    }
    setHidden(true)
  }
  const add = async () => {
    setBusy(true)
    try {
      await install()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Strip>
      <Alert>
        {/* The buttons share the text's line when there is room, and wrap below it, still at the right, when not. */}
        <Row gap={2} align="center" justify="between">
          <Stack gap={1}>
            <Text variant="small">Add {name} to your home screen to open it like an app and get notifications.</Text>
            {way === 'ios' && <Text variant="small">Tap the Share button, then Add to Home Screen.</Text>}
          </Stack>
          <Row gap={2} align="center" shrink={false} push="end">
            <Button variant="ghost" onClick={notNow}>
              Not now
            </Button>
            {way === 'dialog' && (
              <Button variant="secondary" busy={busy} onClick={() => void add()}>
                Add to home screen
              </Button>
            )}
          </Row>
        </Row>
      </Alert>
    </Strip>
  )
}
