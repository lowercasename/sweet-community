import type { GroupMode } from '../api'
import { Field, Select } from '../ui'

const MODES: { value: GroupMode; label: string }[] = [
  { value: 'both', label: 'Posts and chat' },
  { value: 'posts', label: 'Posts only' },
  { value: 'chat', label: 'Chat only' },
]

export function RoomMode({
  value,
  onChange,
  disabled,
}: {
  value: GroupMode
  onChange: (mode: GroupMode) => void
  disabled: boolean
}) {
  return (
    <Field label="Mode">
      <Select value={value} options={MODES} onChange={onChange} disabled={disabled} />
    </Field>
  )
}
