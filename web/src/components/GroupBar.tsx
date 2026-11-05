import { Fragment } from 'react'
import type { Group, User } from '../api'
import { Button, Heading, Row } from '../ui'
import { groupLabel } from './GroupView'
import { PersonName } from './PersonName'

interface GroupBarProps {
  group: Group
  me: User
  /** On a page under the group (Members): the way back to its view. */
  onBack?: () => void
  /** On the group's view: the way to its members. */
  onMembers?: () => void
}

/**
 * The bar every page of a group sits under (architecture.md, Layout): its
 * name, a way to its members from the view (a DM has no settings, so the
 * way is called Members), a way back from anywhere else.
 * The root group has no bar; it is Home.
 */
export function GroupBar({ group, me, onBack, onMembers }: GroupBarProps) {
  const label = groupLabel(group, me)
  // A DM's bar names its people, and each name is a card.
  const others = group.kind === 'dm' ? (group.members ?? []).filter((u) => u.id !== me.id) : []
  return (
    <Row justify="between" align="center" pad>
      <Row gap={1} align="center">
        {onBack && <Button variant="ghost" icon="back" label={`Back to ${label}`} onClick={onBack} />}
        <Heading level={2}>
          {others.length > 0
            ? others.map((u, i) => (
                <Fragment key={u.id}>
                  {i > 0 && ', '}
                  <PersonName user={u} />
                </Fragment>
              ))
            : label}
        </Heading>
      </Row>
      {onMembers && (
        <Button variant="ghost" icon="people" onClick={onMembers}>
          {group.kind === 'dm' ? 'Members' : 'Members and settings'}
        </Button>
      )}
    </Row>
  )
}
