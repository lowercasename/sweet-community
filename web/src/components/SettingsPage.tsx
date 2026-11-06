import { useState } from 'react'
import { logoutEverywhere, uploadImage, type Group, type User } from '../api'
import { useRemoveUser, useSession } from '../data/hooks'
import { useAuthor, useSetPicture } from '../data/hooks'
import { IMAGE_ACCEPT } from '../editor/images'
import { AccountCard } from './AccountCard'
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  FilePicker,
  Heading,
  Measure,
  Pane,
  Row,
  ScrollArea,
  Stack,
  Text,
} from '../ui'

interface SettingsPageProps {
  me: User
  /** The instance as a group: its can flags say whether I edit the instance's settings. */
  root: Group
  /** Sign out: this session via the app's sign-out, or every session after logoutEverywhere. */
  onSignOut: () => void
}

export function SettingsPage({ me, root, onSignOut }: SettingsPageProps) {
  const removeUser = useRemoveUser()
  const { gone } = useSession()
  const [removing, setRemoving] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  // Off this community for good (architecture.md, Admin tools); the instance owner hands over first.
  const removeMe = async () => {
    setRemoveBusy(true)
    try {
      await removeUser(me.id)
      gone()
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Could not remove your account')
      setRemoveBusy(false)
      setRemoving(false)
    }
  }
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
            <AccountCard />
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
            <Card>
              <Stack gap={2}>
                <Heading level={2}>Leave this community</Heading>
                <Text variant="secondary">
                  Removing your account takes you off this community for good. Your posts, comments and messages stay,
                  under a removed name. Rooms you own pass to their longest-serving moderator, or member.
                </Text>
                {root.role === 'owner' ? (
                  <Text variant="secondary">You run this community. Hand it over to someone else first.</Text>
                ) : (
                  <Row>
                    <Button variant="secondary" icon="remove" disabled={removeBusy} onClick={() => setRemoving(true)}>
                      Remove my account
                    </Button>
                  </Row>
                )}
                {removeError && <Text variant="secondary">{removeError}</Text>}
              </Stack>
            </Card>
          </Stack>
        </Measure>
      </ScrollArea>
      <ConfirmDialog
        open={removing}
        title="Remove your account?"
        confirmLabel={removeBusy ? 'Removing…' : 'Remove'}
        busy={removeBusy}
        onConfirm={() => void removeMe()}
        onClose={() => setRemoving(false)}
      >
        <Text variant="secondary">
          You will be signed out everywhere and cannot sign in again. This cannot be undone.
        </Text>
      </ConfirmDialog>
    </Pane>
  )
}
