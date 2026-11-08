import { useState } from 'react'
import { ROOT_ID } from '../data/keys'
import { useRules, useSetRules } from '../data/hooks'
import { commentExtensions } from '../editor/extensions'
import { Alert, Button, Card, Heading, Row, Stack, Text } from '../ui'
import { Body } from './Body'
import { BodyEditor } from './BodyEditor'

/**
 * The community's rules on the Community page, for the owner and moderators (architecture.md, Admin tools). The
 * rules are written in the same editor as a bio.
 */
export function RulesCard() {
  const rules = useRules()
  const setRules = useSetRules()
  const [editing, setEditing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const save = async (html: string) => {
    setProblem(null)
    try {
      await setRules(html)
      setEditing(false)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not save the rules')
      throw e
    }
  }
  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2}>Rules</Heading>
        <Text variant="small">
          Everyone can read the rules from the Rules button on Home. People read them before they join.
        </Text>
        {editing ? (
          <BodyEditor
            groupId={ROOT_ID}
            extensions={commentExtensions}
            size="post"
            placeholder="What everyone here agrees to…"
            submitLabel="Save"
            initialHtml={rules ?? ''}
            disabled={false}
            allowEmpty
            onSubmit={save}
            onCancel={() => setEditing(false)}
          />
        ) : rules ? (
          <Body html={rules} />
        ) : (
          <Text variant="small">This community has no rules yet.</Text>
        )}
        {problem && <Alert tone="error">{problem}</Alert>}
        {!editing && (
          <Row>
            <Button variant="secondary" icon="pencil" onClick={() => setEditing(true)}>
              {rules ? 'Edit rules' : 'Write rules'}
            </Button>
          </Row>
        )}
      </Stack>
    </Card>
  )
}
