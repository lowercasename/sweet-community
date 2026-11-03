import type { StreamStatus } from '../hooks/useEventStream'
import { Text } from '../ui'

interface ConnectionStatusProps {
  status: StreamStatus
}

const LABELS: Record<Exclude<StreamStatus, 'live'>, string> = {
  connecting: 'connecting…',
  reconnecting: 'reconnecting…',
  offline: 'offline — you can read but not post',
}

/** Quiet status line. Renders nothing while live. */
export function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status === 'live') return null
  return <Text variant="secondary">{LABELS[status]}</Text>
}
