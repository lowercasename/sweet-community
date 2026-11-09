import { useState } from 'react'
import { ROOT_ID } from '../data/keys'
import { type TextKind, useCommunityText, useSetCommunityText, useSettings } from '../data/hooks'
import { commentExtensions } from '../editor/extensions'
import { Alert, Button, Card, Heading, Row, shieldText, Stack, Text } from '../ui'
import { Body } from './Body'
import { BodyEditor } from './BodyEditor'

interface Words {
  title: string
  description: (community: string) => string
  empty: string
  placeholder: string
  write: string
  edit: string
  failed: string
}

const WORDS: Record<TextKind, Words> = {
  rules: {
    title: 'Rules',
    description: () =>
      'Everyone can read the rules from the Rules button on Home, or from the menu on a phone. People read them before they join.',
    empty: 'This community has no rules yet.',
    placeholder: 'What everyone here agrees to…',
    write: 'Write rules',
    edit: 'Edit rules',
    failed: 'Could not save the rules',
  },
  welcome: {
    title: 'Welcome message',
    description: (community) =>
      `Everyone who joins sees this when they first open ${community}. You might ask them to introduce themselves, to read the rules, or to say hello in the chat.`,
    empty: 'This community has no welcome message yet.',
    placeholder: 'What newcomers read first…',
    write: 'Write welcome message',
    edit: 'Edit welcome message',
    failed: 'Could not save the welcome message',
  },
}

interface CommunityTextCardProps {
  kind: TextKind
  /** Opens the card in the editor, as when the tour sends the owner to write the welcome message. */
  editing?: boolean
}

/**
 * A text the owner and moderators write for every member, on the Community page. The
 * rules and the welcome message are written in the same editor as a bio.
 */
export function CommunityTextCard({ kind, editing: startEditing = false }: CommunityTextCardProps) {
  const words = WORDS[kind]
  const text = useCommunityText(kind)
  const setText = useSetCommunityText(kind)
  const { settings } = useSettings()
  const [editing, setEditing] = useState(startEditing)
  const [problem, setProblem] = useState<string | null>(null)
  const save = async (html: string) => {
    setProblem(null)
    try {
      await setText(html)
      setEditing(false)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : words.failed)
      throw e
    }
  }
  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2} shield={shieldText.staffSee}>
          {words.title}
        </Heading>
        <Text variant="small">{words.description(settings?.name || 'the community')}</Text>
        {editing ? (
          <BodyEditor
            groupId={ROOT_ID}
            extensions={commentExtensions}
            size="post"
            placeholder={words.placeholder}
            submitLabel="Save"
            initialHtml={text ?? ''}
            disabled={false}
            allowEmpty
            onSubmit={save}
            onCancel={() => setEditing(false)}
          />
        ) : text ? (
          <Body html={text} />
        ) : (
          <Text variant="small">{words.empty}</Text>
        )}
        {problem && <Alert tone="error">{problem}</Alert>}
        {!editing && (
          <Row>
            <Button variant="secondary" icon="pencil" onClick={() => setEditing(true)}>
              {text ? words.edit : words.write}
            </Button>
          </Row>
        )}
      </Stack>
    </Card>
  )
}

export const RulesCard = () => <CommunityTextCard kind="rules" />

export const WelcomeCard = ({ editing }: { editing?: boolean }) => (
  <CommunityTextCard kind="welcome" editing={editing} />
)
