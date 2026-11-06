import type { StreamStatus } from '../hooks/useEventStream'
import { Alert } from '../ui'

interface ConnectionStatusProps {
  status: StreamStatus
}

const LABELS: Record<Exclude<StreamStatus, 'live'>, string> = {
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline: you can read but not post',
}

/** The stream's state as a notice above the editor. Renders nothing while live. */
export function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status === 'live') return null
  return <Alert tone={status === 'offline' ? 'warning' : 'notice'}>{LABELS[status]}</Alert>
}
