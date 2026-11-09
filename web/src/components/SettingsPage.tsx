import { useState } from 'react'
import { logoutEverywhere, uploadImage, type Group, type User } from '../api'
import { useRemoveUser, useSession } from '../data/hooks'
import { useAuthor, useSetPicture } from '../data/hooks'
import { IMAGE_ACCEPT } from '../editor/images'
import { AccountCard } from './AccountCard'
import { ColoursCard } from './ColoursCard'
import { NotificationsCard } from './NotificationsCard'
import {
  ActionRow,
  ActionRows,
  Alert,
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
  /**
   * The root group, which represents the instance. Its can flags say whether
   * the user can edit the instance's settings.
   */
  root: Group
  /**
   * Signs out of this session through the app's sign-out. Also called after
   * logoutEverywhere signs out every session.
   */
  onSignOut: () => void
}

export function SettingsPage({ me, root, onSignOut }: SettingsPageProps) {
  const removeUser = useRemoveUser()
  const { gone } = useSession()
  const [removing, setRemoving] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  // Permanently removes the user from this community (architecture.md, Admin tools). The instance owner must transfer
  // ownership first.
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
  const [signingOut, setSigningOut] = useState(false)
  const [everywhereOpen, setEverywhereOpen] = useState(false)
  const [pictureBusy, setPictureBusy] = useState<'choose' | 'remove' | null>(null)
  const [pictureError, setPictureError] = useState<string | null>(null)

  const choosePicture = async (file: File) => {
    setPictureBusy('choose')
    setPictureError(null)
    try {
      const img = await uploadImage(file)
      await setPicture(img.id)
    } catch (e) {
      setPictureError(e instanceof Error ? e.message : 'Could not set the picture')
    } finally {
      setPictureBusy(null)
    }
  }

  const removePicture = async () => {
    setPictureBusy('remove')
    setPictureError(null)
    try {
      await setPicture(null)
    } catch (e) {
      setPictureError(e instanceof Error ? e.message : 'Could not remove the picture')
    } finally {
      setPictureBusy(null)
    }
  }
  const everywhere = async () => {
    setSigningOut(true)
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
                <Row gap={2} align="center">
                  <Avatar name={live.username} picture={live.picture} />
                  <FilePicker
                    accept={IMAGE_ACCEPT}
                    variant="secondary"
                    icon="image"
                    label="Choose a picture"
                    disabled={pictureBusy !== null}
                    busy={pictureBusy === 'choose'}
                    onPick={(files) => void choosePicture(files[0])}
                  >
                    Choose a picture
                  </FilePicker>
                  {live.picture && (
                    <Button
                      variant="danger"
                      icon="remove"
                      disabled={pictureBusy !== null}
                      busy={pictureBusy === 'remove'}
                      onClick={() => void removePicture()}
                    >
                      Remove picture
                    </Button>
                  )}
                </Row>
                {pictureError && <Alert tone="error">{pictureError}</Alert>}
              </Stack>
            </Card>
            <AccountCard />
            <NotificationsCard />
            <ColoursCard />
            <Card>
              <Stack gap={2}>
                <Heading level={2}>Sign out and leave</Heading>
                {removeError && <Alert tone="error">{removeError}</Alert>}
                <ActionRows>
                  <ActionRow
                    title="This device"
                    action={
                      <Button variant="secondary" icon="logout" disabled={signingOut} onClick={onSignOut}>
                        Sign out
                      </Button>
                    }
                  >
                    Sign out of Sweet in this browser.
                  </ActionRow>
                  <ActionRow
                    title="Every device"
                    action={
                      <Button
                        variant="danger"
                        icon="devices"
                        disabled={signingOut}
                        onClick={() => setEverywhereOpen(true)}
                      >
                        Sign out everywhere
                      </Button>
                    }
                  >
                    Sign out everywhere, including this browser. Use this if you have lost a device or think someone
                    else has your password.
                  </ActionRow>
                  <ActionRow
                    title="Leave this community"
                    action={
                      root.role === 'owner' ? undefined : (
                        <Button variant="danger" icon="remove" disabled={removeBusy} onClick={() => setRemoving(true)}>
                          Remove my account
                        </Button>
                      )
                    }
                  >
                    {root.role === 'owner'
                      ? 'You run this community. Hand it over to someone else before you leave.'
                      : 'Your account is removed for good, and your posts, comments and messages are deleted. Rooms you own are handed to another member.'}
                  </ActionRow>
                </ActionRows>
              </Stack>
            </Card>
          </Stack>
        </Measure>
      </ScrollArea>
      <ConfirmDialog
        open={everywhereOpen}
        title="Sign out everywhere?"
        confirmLabel="Sign out everywhere"
        icon="devices"
        busy={signingOut}
        onConfirm={() => void everywhere()}
        onClose={() => setEverywhereOpen(false)}
      >
        <Text variant="secondary">Every device signed in to your account will be signed out, including this one.</Text>
      </ConfirmDialog>
      <ConfirmDialog
        open={removing}
        title="Remove your account?"
        confirmLabel="Remove my account"
        icon="remove"
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
