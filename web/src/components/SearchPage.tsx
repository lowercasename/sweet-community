import { useState } from 'react'
import type { Group, Hit } from '../api'
import { useAuthor, useSearch } from '../data/hooks'
import { groupPath, postPath } from '../routes'
import {
  Alert,
  Avatar,
  Card,
  Form,
  Input,
  List,
  ListItem,
  ListRow,
  Measure,
  Pane,
  ScrollArea,
  Stack,
  Text,
  Time,
} from '../ui'

interface SearchPageProps {
  /** The search query from the URL. */
  query: string
  groups: Group[]
  onGo: (path: string) => void
}

const KIND_WORD: Record<Hit['kind'], string> = { post: 'Post', comment: 'Comment', message: 'Message' }

/** The most characters a query may have. The server refuses a longer one (MaxQuery in internal/api/search.go). */
const QUERY_MAX = 200

/**
 * The search page. The query is stored in the URL,
 * so a search can be bookmarked or shared. The hits are posts, comments and
 * messages from the groups the user is in, best match first. Each hit shows
 * its kind, its location, its author and its time, with the matching words
 * marked. A hit opens its post, or its group for a message. The search input
 * takes the whole width and Enter submits the search. A search input needs no
 * label and no button beside it (Raphael, 2026-11-06).
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
              <Form onSubmit={() => typed.trim() !== '' && onGo(`/search?q=${encodeURIComponent(typed.trim())}`)}>
                <Input
                  value={typed}
                  onChange={setTyped}
                  label="Search"
                  placeholder="Search"
                  autoFocus
                  maxLength={QUERY_MAX}
                />
              </Form>
            </Card>
            {error && <Alert tone="error">{error.message}</Alert>}
            {query.trim() !== '' && !loading && hits.length === 0 && !error && (
              <Card>
                <Text variant="secondary">Nothing matches "{query}".</Text>
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

/** One hit row. It shows the author, kind, location and time, then the excerpt with its matches in bold. */
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
            {author.username} · {KIND_WORD[hit.kind]}
            {place ? ` in ${place}` : ''} · <Time at={hit.created_at} />
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
