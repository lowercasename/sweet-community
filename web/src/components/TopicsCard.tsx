import { useState } from 'react'
import type { Topic } from '../api'
import { useTopicActions, useTopics } from '../data/hooks'
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Form,
  Hairline,
  Heading,
  Input,
  List,
  ListItem,
  Menu,
  Row,
  shieldText,
  Stack,
  Text,
} from '../ui'

const ABOUT =
  'A topic is a label a post on the Home feed can carry. People can read one topic at a time, and can subscribe to notifications for a specific topic. Topics are always optional.'

/** The community's topics, for its staff: the list with its counts, add, rename, delete. */
export function TopicsCard() {
  const { topics, error } = useTopics()
  const actions = useTopicActions()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editing, setEditing] = useState<Topic | null>(null)
  const [deleting, setDeleting] = useState<Topic | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setProblem(null)
    try {
      await fn()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  const add = () =>
    run(async () => {
      await actions.create(name.trim(), description.trim())
      setName('')
      setDescription('')
    })
  const remove = () =>
    run(async () => {
      if (deleting) await actions.remove(deleting.id)
      setDeleting(null)
    })

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2} shield={shieldText.staffSee}>
          Topics
        </Heading>
        <Text variant="small">{ABOUT}</Text>
        <Form onSubmit={() => void add()}>
          <Field label="Topic name" hint="Up to 40 characters.">
            <Input value={name} onChange={setName} maxLength={40} required />
          </Field>
          <Field label="Short description">
            <Input value={description} onChange={setDescription} maxLength={140} />
          </Field>
          <Row justify="end">
            <Button type="submit" disabled={name.trim() === ''} busy={busy}>
              Create topic
            </Button>
          </Row>
        </Form>
        {error && <Alert tone="error">{error.message}</Alert>}
        {problem && <Alert tone="error">{problem}</Alert>}
        {topics.length > 0 && (
          <>
            <Hairline />
            <List>
              {topics.map((t) => (
                <ListItem key={t.id}>
                  {editing?.id === t.id ? (
                    <TopicFields
                      topic={t}
                      busy={busy}
                      submitLabel="Save"
                      onSubmit={(n, d) => run(() => actions.update(t.id, n, d)).then(() => setEditing(null))}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <Row justify="between" align="start" wrap="never">
                      <Stack gap={0}>
                        <Text weight="bold">{t.name}</Text>
                        <Text variant="small">
                          {t.description && `${t.description} `} &middot; {plural(t.post_count, 'post', 'posts')},{' '}
                          {plural(t.follower_count, 'subscriber', 'subscribers')}
                        </Text>
                      </Stack>
                      <Menu
                        label={`Options for ${t.name}`}
                        items={[
                          { label: 'Edit', icon: 'pencil', onSelect: () => setEditing(t) },
                          { label: 'Delete', icon: 'trash', danger: true, onSelect: () => setDeleting(t) },
                        ]}
                      />
                    </Row>
                  )}
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Stack>
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.name}?` : ''}
        confirmLabel="Delete"
        icon="trash"
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setDeleting(null)}
      >
        {deleting && (
          <Text variant="secondary">
            Its {plural(deleting.post_count, 'post stays', 'posts stay')}, without a topic. Its{' '}
            {plural(deleting.follower_count, 'subscriber', 'subscribers')} will no longer be notified. This action
            cannot be undone.
          </Text>
        )}
      </ConfirmDialog>
    </Card>
  )
}

interface TopicFieldsProps {
  topic: Topic
  busy: boolean
  submitLabel: string
  onSubmit: (name: string, description: string) => void
  onCancel: () => void
}

/** The two fields of a topic, in place of its row while it is edited. */
function TopicFields({ topic, busy, submitLabel, onSubmit, onCancel }: TopicFieldsProps) {
  const [name, setName] = useState(topic.name)
  const [description, setDescription] = useState(topic.description)
  return (
    <Form onSubmit={() => onSubmit(name.trim(), description.trim())}>
      <Field label="Topic name">
        <Input value={name} onChange={setName} maxLength={40} required autoFocus />
      </Field>
      <Field label="Short description">
        <Input value={description} onChange={setDescription} maxLength={140} />
      </Field>
      <Row justify="end" gap={3}>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={name.trim() === ''} busy={busy}>
          {submitLabel}
        </Button>
      </Row>
    </Form>
  )
}
