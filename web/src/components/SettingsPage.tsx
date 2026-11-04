import { useState } from 'react'
import { logoutEverywhere, uploadImage, type User } from '../api'
import { useAuthor, useSetPicture } from '../data/hooks'
import { IMAGE_ACCEPT } from '../editor/images'
import { Avatar, Button, Card, FilePicker, Heading, Measure, Pane, Row, ScrollArea, Stack, Text } from '../ui'

interface SettingsPageProps {
  me: User
  /** Sign out: this session via the app's sign-out, or every session after logoutEverywhere. */
  onSignOut: () => void
}

export function SettingsPage({ me, onSignOut }: SettingsPageProps) {
  const live = useAuthor(me)
  const setPicture = useSetPicture()
  const [busy, setBusy] = useState(false)
  const [pictureBusy, setPictureBusy] = useState(false)
  const [pictureError, setPictureError] = useState<string | null>(null)

  const choosePicture = async (file: File) => {
    setPictureBusy(true)
    setPictureError(null)
    try {
      const img = await uploadImage(file)
      await setPicture(img.id)
    } catch (e) {
      setPictureError(e instanceof Error ? e.message : 'Could not set the picture')
    } finally {
      setPictureBusy(false)
    }
  }

  const removePicture = async () => {
    setPictureBusy(true)
    try {
      await setPicture(null)
    } finally {
      setPictureBusy(false)
    }
  }
  const everywhere = async () => {
    setBusy(true)
    await logoutEverywhere()
    onSignOut()
  }
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            <Card>
              <Stack gap={2}>
                <Heading level={2}>Profile picture</Heading>
                <Row gap={3} align="center">
                  <Avatar name={live.username} picture={live.picture} />
                  <FilePicker
                    accept={IMAGE_ACCEPT}
                    variant="secondary"
                    icon="image"
                    label="Choose a picture"
                    disabled={pictureBusy}
                    onPick={(files) => void choosePicture(files[0])}
                  >
                    {pictureBusy ? 'Uploading…' : 'Choose a picture'}
                  </FilePicker>
                  {live.picture && (
                    <Button variant="ghost" disabled={pictureBusy} onClick={() => void removePicture()}>
                      Back to the donut
                    </Button>
                  )}
                </Row>
                {pictureError && <Text variant="secondary">{pictureError}</Text>}
              </Stack>
            </Card>
            <Card>
              <Stack gap={2}>
                <Heading level={2}>Sign out</Heading>
                <Text variant="secondary">
                  If you have lost a device or think someone else has access to your account, sign out everywhere, which
                  will end every logged in session including this one.
                </Text>
                <Row>
                  <Button variant="secondary" disabled={busy} icon="logout" onClick={onSignOut}>
                    Sign out here
                  </Button>
                  <Button variant="secondary" disabled={busy} icon="devices" onClick={() => void everywhere()}>
                    {busy ? 'Signing out…' : 'Sign out everywhere'}
                  </Button>
                </Row>
              </Stack>
            </Card>
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
