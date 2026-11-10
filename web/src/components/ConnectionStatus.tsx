import type { StreamStatus } from '../hooks/useEventStream'
import { Badge } from '../ui'

interface ConnectionStatusProps {
  status: StreamStatus
}

/**
 * An Offline badge for the page bar while the device is offline. Live, connecting and reconnecting render nothing,
 * because a short reconnect is not something the user needs to act on.
 */
export function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status !== 'offline') return null
  return <Badge icon="offline">Offline</Badge>
}
