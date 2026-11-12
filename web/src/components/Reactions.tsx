import type { Reaction, Reactions as ReactionsData } from '../api'
import { useFrequentReactions, useMe, useReact, useUsers } from '../data/hooks'
import { EmojiButton, ReactionPill, Row } from '../ui'

/** The emoji the reaction picker offers when the viewer has used fewer than six. */
const COMMON = ['👍', '❤️', '😂', '😮', '😢', '🙏']

/** The six emoji the reaction picker offers first: the viewer's most used, then common ones. */
export function quickReactions(frequent: string[]): string[] {
  return [...frequent, ...COMMON.filter((e) => !frequent.includes(e))].slice(0, 6)
}

interface AddReactionProps {
  onPick: (emoji: string) => void
  /** The 26px size, for an item's action bar. */
  compact?: boolean
  disabled?: boolean
  onOpenChange?: (open: boolean) => void
}

/** The Add reaction button. Its picker offers the viewer's most used emoji first (quickReactions). */
export function AddReaction(props: AddReactionProps) {
  const { data: frequent } = useFrequentReactions()
  return <EmojiButton {...props} reactions={quickReactions(frequent ?? [])} />
}

/** Who chose an emoji, as its tooltip says it: "You, kit and jo reacted with 👍". At most ten names are listed. */
export function reactedLabel(r: Reaction, nameOf: (id: string) => string, meId: string | undefined): string {
  const names = [
    ...(meId !== undefined && r.user_ids.includes(meId) ? ['You'] : []),
    ...r.user_ids.filter((id) => id !== meId).map(nameOf),
  ]
  const shown = names.length > 10 ? [...names.slice(0, 9), `${names.length - 9} others`] : names
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  return `${list} reacted with ${r.emoji}`
}

interface ReactionsProps {
  reactions: Reaction[]
  /** Adds or removes the viewer's reaction with this emoji. */
  onToggle: (emoji: string) => void
  disabled?: boolean
}

/**
 * The reactions on a post, comment or message: one toggle for each emoji, in the order the emoji were first chosen.
 * Each shows how many people chose it, and its tooltip names them with their current names. Nothing is drawn when
 * there are no reactions.
 */
export function Reactions({ reactions, onToggle, disabled }: ReactionsProps) {
  const { data: me } = useMe()
  const { data: users } = useUsers()
  if (reactions.length === 0) return null
  const nameOf = (id: string) => users?.get(id)?.username ?? 'Someone'
  return (
    <Row gap={1} align="center">
      {reactions.map((r) => (
        <ReactionPill
          key={r.emoji}
          emoji={r.emoji}
          count={r.user_ids.length}
          mine={me != null && r.user_ids.includes(me.id)}
          label={reactedLabel(r, nameOf, me?.id)}
          disabled={disabled}
          onToggle={() => onToggle(r.emoji)}
        />
      ))}
    </Row>
  )
}

/**
 * Adds and removes the viewer's reactions. Choosing an emoji the viewer already chose removes it. The returned function
 * resolves with the server's reason when the change fails, and with null when it succeeds.
 */
export function useToggleReaction() {
  const react = useReact()
  const { data: me } = useMe()
  return async (kind: ReactionsData['kind'], id: string, reactions: Reaction[], emoji: string) => {
    const mine = me != null && reactions.some((r) => r.emoji === emoji && r.user_ids.includes(me.id))
    try {
      await react(kind, id, emoji, !mine)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not change the reaction'
    }
  }
}
