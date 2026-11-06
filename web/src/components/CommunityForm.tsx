import { useState } from 'react'
import type { Settings } from '../api'
import { useSetSettings } from '../data/hooks'
import { Alert, Button, Field, Form, Input, Row, Select, Stack, Textarea } from '../ui'

interface CommunityFormProps {
  settings: Settings
  /** What the button says. */
  submitLabel: string
  /** After a successful save. */
  onSaved?: () => void
}

const CREATION: { value: Settings['group_creation']; label: string }[] = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'staff', label: 'Only the owner and moderators' },
]

/**
 * The community's own settings (architecture.md, Admin tools): its name,
 * what it is for, who may make rooms. One form for the welcome page and the
 * Community page, so the two cannot disagree on what a community has.
 */
export function CommunityForm({ settings, submitLabel, onSaved }: CommunityFormProps) {
  const setSettings = useSetSettings()
  const [name, setName] = useState(settings.name)
  const [description, setDescription] = useState(settings.description)
  const [creation, setCreation] = useState(settings.group_creation)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'notice' | 'error'; text: string } | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      await setSettings({ name: name.trim(), description: description.trim(), group_creation: creation })
      setNote({ tone: 'notice', text: 'Saved.' })
      onSaved?.()
    } catch (e) {
      setNote({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Form onSubmit={() => void submit()}>
      <Stack gap={2}>
        <Field label="Name">
          <Input name="name" value={name} onChange={setName} autoFocus={settings.name === ''} required />
        </Field>
        <Field label="What it is for">
          <Textarea value={description} onChange={setDescription} rows={3} maxLength={500} />
        </Field>
        <Field label="Who can create rooms">
          <Select value={creation} options={CREATION} onChange={setCreation} disabled={busy} />
        </Field>
        {note && <Alert tone={note.tone}>{note.text}</Alert>}
        <Row justify="end">
          <Button type="submit" disabled={busy || name.trim() === ''}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </Row>
      </Stack>
    </Form>
  )
}
