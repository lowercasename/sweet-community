import { useState } from 'react'
import { useRoomNotificationPreference } from '../data/hooks'
import { useStreamStatus } from '../hooks/StreamContext'
import type { RoomNotificationMode } from '../api'
import { Alert, Menu, Row } from '../ui'

export function RoomNotifications({ groupId }: { groupId: string }) {
  const disabled = useStreamStatus() === 'offline'
  const { data, error, set } = useRoomNotificationPreference(groupId)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const change = async (mode: RoomNotificationMode) => {
    setBusy(true)
    setProblem(null)
    try {
      await set(mode)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not save your choice')
    } finally {
      setBusy(false)
    }
  }
  const choices: { mode: RoomNotificationMode; label: string; detail: string }[] = [
    { mode: 'all', label: 'All messages', detail: 'Device alerts for every new chat message.' },
    { mode: 'mentions', label: 'Mentions and replies', detail: 'Device alerts only when someone addresses you.' },
    { mode: 'off', label: 'Off', detail: 'No device alerts from this chat, including mentions.' },
  ]
  const label = choices.find((choice) => choice.mode === data?.mode)?.label ?? 'Loading…'
  return (
    <>
      <Row pad="compact" justify="end" align="center" shrink={false}>
        <Menu
          label={`Chat device alerts: ${label}`}
          icon={data?.mode === 'off' ? 'bell-off' : 'bell'}
          disabled={disabled || busy || !data}
          items={choices.map((choice) => ({
            label: choice.label,
            detail: choice.detail,
            checked: choice.mode === data?.mode,
            onSelect: () => void change(choice.mode),
          }))}
        />
      </Row>
      {(error || problem) && <Alert tone="error">{problem ?? error?.message}</Alert>}
    </>
  )
}
