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
  Heading,
  Input,
  List,
  ListItem,
  Menu,
  Row,
  Stack,
  Text,
} from '../ui'

const ABOUT =
  'A topic is a label a post can carry. People can read one topic at a time, and ask to be told when something new is posted in it. Posts do not need one.'

/** The community's topics, for its staff (architecture.md, Topics): the list with its counts, add, rename, delete. */
export function TopicsCard() {
  const { topics, loading, error } = useTopics()
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
        <Heading level={2}>Topics</Heading>
        <Text variant="secondary">
          {ABOUT}
          {!loading && topics.length === 0 && ' Until you add some, nobody sees anything about topics.'}
        </Text>
        {error && <Alert tone="error">{error.message}</Alert>}
        {problem && <Alert tone="error">{problem}</Alert>}
        {topics.length > 0 && (
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
                        {t.description && `${t.description} `}
                        {plural(t.post_count, 'post', 'posts')}, {plural(t.follower_count, 'person', 'people')}{' '}
                        notified.
                      </Text>
                    </Stack>
                    <Menu
                      label={`Options for ${t.name}`}
                      items={[
                        { label: 'Edit', icon: 'pencil', onSelect: () => setEditing(t) },
                        { label: 'Delete', icon: 'trash', onSelect: () => setDeleting(t) },
                      ]}
                    />
                  </Row>
                )}
              </ListItem>
            ))}
          </List>
        )}
        <Form onSubmit={() => void add()}>
          <Field label="Topic name" hint="Up to 40 characters. No two topics share a name.">
            <Input value={name} onChange={setName} maxLength={40} required />
          </Field>
          <Field label="What goes in it" hint="Optional, one line, shown under the name wherever the topic is chosen.">
            <Input value={description} onChange={setDescription} maxLength={140} />
          </Field>
          <Row justify="end">
            <Button type="submit" variant="secondary" disabled={busy || name.trim() === ''}>
              {busy ? 'Adding…' : 'Add topic'}
            </Button>
          </Row>
        </Form>
      </Stack>
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.name}?` : ''}
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setDeleting(null)}
      >
        {deleting && (
          <Text variant="secondary">
            Its {plural(deleting.post_count, 'post stays', 'posts stay')}, without a topic. The{' '}
            {plural(deleting.follower_count, 'person', 'people')} who asked to be notified about it will not be any
            more. This action cannot be undone.
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
      <Field label="What goes in it">
        <Input value={description} onChange={setDescription} maxLength={140} />
      </Field>
      <Row justify="end" gap={3}>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary" disabled={busy || name.trim() === ''}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </Row>
    </Form>
  )
}
