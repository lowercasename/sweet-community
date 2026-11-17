import { useState } from 'react'
import { useRoomSidebar } from '../data/hooks'
import { useStreamStatus } from '../hooks/StreamContext'
import { Button, ConfirmDialog, Text } from '../ui'

export function RoomShortcut({ groupId }: { groupId: string }) {
  const sidebar = useRoomSidebar()
  const offline = useStreamStatus() === 'offline'
  const saved = sidebar.data?.rooms.find((room) => room.group_id === groupId)?.in_sidebar ?? false
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const change = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await sidebar.set(groupId, !saved)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not save the shortcut')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        icon={saved ? 'star-filled' : 'star'}
        pressed={saved}
        label={
          sidebar.isError && !sidebar.data ? 'Retry loading sidebar' : saved ? 'Remove from sidebar' : 'Add to sidebar'
        }
        disabled={offline || sidebar.isPending}
        busy={busy}
        onClick={() => void (sidebar.isError && !sidebar.data ? sidebar.refetch() : change())}
      />
      <ConfirmDialog
        open={problem !== null}
        title="Could not save shortcut"
        confirmLabel="Try again"
        cancelLabel="Close"
        onClose={() => setProblem(null)}
        onConfirm={() => void change()}
        busy={busy}
      >
        <Text>{problem}</Text>
      </ConfirmDialog>
    </>
  )
}
