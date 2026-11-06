import { useState } from 'react'
import type { Group, Hit } from '../api'
import { useAuthor, useSearch } from '../data/hooks'
import { groupPath, postPath } from '../routes'
import {
  Alert,
  Avatar,
  Button,
  Card,
  Field,
  Form,
  Input,
  List,
  ListItem,
  ListRow,
  Measure,
  Pane,
  Row,
  ScrollArea,
  Stack,
  Text,
  Time,
} from '../ui'

interface SearchPageProps {
  /** The words from the URL. */
  query: string
  groups: Group[]
  onGo: (path: string) => void
}

const KIND_WORD: Record<Hit['kind'], string> = { post: 'Post', comment: 'Comment', message: 'Message' }

/**
 * Search (architecture.md, Search): the words go in the URL, so a search
 * can be kept or sent; the hits are posts, comments and messages from the
 * rooms I am in, best match first, each saying what and where it is, who
 * said it and when, with the matching words marked. A hit opens its post,
 * or its room for a message.
 */
export function SearchPage({ query, groups, onGo }: SearchPageProps) {
  const [typed, setTyped] = useState(query)
  const { hits, loading, error } = useSearch(query)
  const root = groups.find((g) => g.kind === 'root')
  const placeOf = (gid: string) => {
    const g = groups.find((x) => x.id === gid)
    return !g || g.kind === 'root' ? undefined : g.name
  }
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Stack gap={3}>
            <Card>
              <Form onSubmit={() => onGo(`/search?q=${encodeURIComponent(typed.trim())}`)}>
                <Row gap={2} align="end">
                  <Field label="Search for">
                    <Input value={typed} onChange={setTyped} autoFocus />
                  </Field>
                  <Button type="submit" disabled={typed.trim() === ''}>
                    Search
                  </Button>
                </Row>
              </Form>
            </Card>
            {error && <Alert tone="error">{error.message}</Alert>}
            {query.trim() !== '' && !loading && hits.length === 0 && !error && (
              <Card>
                <Text variant="secondary">Nothing matches "{query}" in the rooms you are in.</Text>
              </Card>
            )}
            {hits.length > 0 && (
              <Card>
                <List gap={1}>
                  {hits.map((h) => (
                    <HitRow
                      key={`${h.kind}:${h.id}`}
                      hit={h}
                      place={placeOf(h.group_id)}
                      onOpen={() => onGo(h.post_id ? postPath(h.post_id) : groupPath(h.group_id, root?.id))}
                    />
                  ))}
                </List>
              </Card>
            )}
          </Stack>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}

/** One hit: what and where, who and when, and the excerpt with its matches in bold. */
function HitRow({ hit, place, onOpen }: { hit: Hit; place?: string; onOpen: () => void }) {
  const author = useAuthor(hit.author)
  const plain = hit.excerpt.replace(/[\x01\x02]/g, '')
  const parts = hit.excerpt.split(/(\x01[^\x02]*\x02)/)
  return (
    <ListItem>
      <ListRow
        label={`${KIND_WORD[hit.kind]}${place ? ` in ${place}` : ''} by ${author.username}: ${plain}`}
        onClick={onOpen}
      >
        <Avatar name={author.username} picture={author.picture} size="sm" decorative />
        <Stack gap={0}>
          <Text as="span" variant="small">
            {KIND_WORD[hit.kind]}
            {place ? ` in ${place}` : ''} · {author.username} · <Time at={hit.created_at} />
          </Text>
          <Text as="span" variant="body">
            {parts.map((p, i) =>
              p.startsWith('\x01') ? (
                <Text key={i} as="span" variant="body" weight="bold">
                  {p.slice(1, -1)}
                </Text>
              ) : (
                p
              ),
            )}
          </Text>
        </Stack>
      </ListRow>
    </ListItem>
  )
}
