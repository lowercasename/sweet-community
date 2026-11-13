import { useState } from 'react'
import type { Community } from '../storeapp/communities'
import { hostOf } from '../storeapp/communities'
import {
  Alert,
  Button,
  Card,
  Centered,
  ConfirmDialog,
  Field,
  Form,
  Heading,
  Input,
  List,
  ListItem,
  ListRow,
  Row,
  Stack,
  Text,
  Wordmark,
} from '../ui'

interface CommunityListProps {
  communities: Community[]
  /** A community that could not be loaded, shown here in its place. The list says so above its rows. */
  unreachable?: Community | null
  onOpen: (c: Community) => void
  /** Checks and adds the address the person typed. Rejects with a sentence to show when it cannot. */
  onAdd: (typed: string) => Promise<void>
  onRemove: (c: Community) => Promise<void>
}

/**
 * The store app's list of communities on this device. Each row opens its community, and its button removes it. Below
 * the list a community is added by its address. The page uses the sign-in pages' narrow column, with Sweet's wordmark
 * above the cards.
 */
export function CommunityList({ communities, unreachable, onOpen, onAdd, onRemove }: CommunityListProps) {
  const [typed, setTyped] = useState('')
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Community | null>(null)
  const [busyRemoving, setBusyRemoving] = useState(false)

  const add = async () => {
    if (adding) return
    setAdding(true)
    setProblem(null)
    try {
      await onAdd(typed)
      setTyped('')
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not add the community')
    } finally {
      setAdding(false)
    }
  }
  const remove = async () => {
    if (!removing) return
    setBusyRemoving(true)
    try {
      await onRemove(removing)
      setRemoving(null)
    } finally {
      setBusyRemoving(false)
    }
  }

  return (
    <Centered head={<Wordmark />}>
      {communities.length > 0 && (
        <Card>
          <Stack gap={2}>
            <Heading level={2}>Your communities</Heading>
            {unreachable && (
              <Alert tone="error">
                Could not reach {unreachable.name}. Check your connection, then tap it to try again.
              </Alert>
            )}
            <List>
              {communities.map((c) => (
                <ListItem key={c.url}>
                  <Row justify="between" align="center" wrap="never">
                    <ListRow label={`Open ${c.name}`} onClick={() => onOpen(c)}>
                      <Stack gap={0}>
                        <Text as="span" variant="name">
                          {c.name}
                        </Text>
                        <Text as="span" variant="small">
                          {hostOf(c.url)}
                        </Text>
                      </Stack>
                    </ListRow>
                    <Button variant="danger" icon="trash" onClick={() => setRemoving(c)}>
                      Remove
                    </Button>
                  </Row>
                </ListItem>
              ))}
            </List>
          </Stack>
        </Card>
      )}
      <Card>
        <Stack gap={3}>
          <Stack gap={1}>
            <Heading level={2}>Add a community</Heading>
            <Text variant="small">Enter the address of the Sweet community you belong to.</Text>
          </Stack>
          <Form onSubmit={() => void add()}>
            <Field label="Address" hint="For example, example.sweet.community">
              <Input name="address" inputMode="url" value={typed} onChange={setTyped} autoComplete="url" required />
            </Field>
            {problem && <Alert tone="error">{problem}</Alert>}
            <Row justify="end">
              <Button type="submit" disabled={!typed.trim()} busy={adding}>
                Add
              </Button>
            </Row>
          </Form>
        </Stack>
      </Card>
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        confirmLabel="Remove"
        icon="trash"
        busy={busyRemoving}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      >
        This device will be signed out of this community. You can add it again at any time.
      </ConfirmDialog>
    </Centered>
  )
}
