/**
 * The welcome tour's steps. A pure function of the
 * user and the community, so the choice of steps is tested without a browser.
 */

/** What decides which steps a user gets. */
export interface TourContext {
  community: string
  /** The phone layout: one column at a time, a tab bar with a Menu tab. */
  phone: boolean
  owner: boolean
  canCreateRooms: boolean
  /** The name of one of the community's topics, when it has any. */
  topic?: string
  hasRules: boolean
}

export type TourStepId =
  'posts' | 'chat' | 'divider' | 'topics' | 'rooms' | 'conversations' | 'rules' | 'community' | 'welcome'

export interface TourStep {
  id: TourStepId
  /** The `data-tour` name of the element the card points at, or null for a card in the middle of the screen. */
  target: string | null
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
  title: string
  /** The card's text, one string per paragraph. */
  body: string[]
  /** The primary button's text. */
  primary: string
  /** The button that ends the tour early, or null on a card that has none. */
  skip: string | null
}

type Draft = Omit<TourStep, 'primary' | 'skip'>

export function tourSteps(c: TourContext): TourStep[] {
  const { community, phone, owner } = c
  const menu = { target: 'menu', placement: 'top' } as const
  const drafts: Draft[] = []

  drafts.push({
    id: 'posts',
    ...(phone ? { target: 'view-posts', placement: 'bottom' } : { target: 'posts', placement: 'right' }),
    title: 'Posts',
    body: [
      `${phone ? 'Posts are here.' : 'This column is for posts.'} A post is a longer, lasting piece of writing that people can comment on.`,
    ],
  })
  drafts.push({
    id: 'chat',
    ...(phone ? { target: 'view-chat', placement: 'bottom' } : { target: 'chat', placement: 'left' }),
    title: 'Chat',
    body: [
      phone
        ? `Tap here to switch to the chat. Everyone in ${community} can read and write in it. Use it for quick messages. The icon beside it switches back to posts.`
        : `This column is the chat. Everyone in ${community} can read and write in it. Use it for quick messages.`,
    ],
  })
  if (!phone) {
    drafts.push({
      id: 'divider',
      target: 'divider',
      placement: 'right',
      title: 'Resize the columns',
      body: [
        'Drag this line to make one column wider. Drag it all the way to one side to hide a column. Click the strip that is left to bring that column back.',
      ],
    })
  }
  if (c.topic) {
    drafts.push({
      id: 'topics',
      target: 'topics',
      placement: 'bottom',
      title: 'Topics',
      body: [
        `A post can have a topic, such as ${c.topic}. Choose a topic here to see only its posts. While a topic is chosen, anything you post goes into it. Subscribe to a topic to get a notification when someone posts in it.`,
      ],
    })
  }
  if (c.canCreateRooms) {
    const example = owner
      ? `You could make one for you and the moderators who help you run ${community}, or for a few people who share an interest.`
      : 'You could make one to bring together a few people who share an interest.'
    drafts.push({
      id: 'rooms',
      ...(phone ? menu : { target: 'rooms', placement: 'right' }),
      title: 'Rooms',
      body: [
        `A room is a private space with its own posts and chat. Only the people in it can see it. ${example} ${phone ? 'Your rooms are in the Menu, and you can create one there.' : 'Create one with the plus button, then add people to it.'}`,
      ],
    })
  }
  drafts.push({
    id: 'conversations',
    ...(phone ? menu : { target: 'conversations', placement: 'right' }),
    title: 'Conversations',
    body: [
      `A conversation is a private chat between you and one other person. ${phone ? 'Your conversations are in the Menu. Start one there, or with Message on the People page.' : 'Start one with the plus button, or with Message on the People page.'}`,
    ],
  })
  if (!owner && c.hasRules) {
    drafts.push({
      id: 'rules',
      ...(phone ? menu : { target: 'rules', placement: 'bottom' }),
      title: 'Rules',
      body: [
        `You agreed to ${community}'s rules when you joined. You can read them again ${phone ? 'in the Menu' : 'here'}.`,
      ],
    })
  }
  if (owner) {
    drafts.push({
      id: 'community',
      ...(phone ? menu : { target: 'community', placement: 'right' }),
      title: `Running ${community}`,
      body: [
        `${phone ? 'The Community page is in the Menu. ' : ''}The Community page is where you look after ${community}. You can change its name and description, write its rules, add topics, and see posts and messages that members have reported. A shield marks any action or section that only you and your moderators can see.`,
        `Moderators help you look after ${community}. You choose them on the People page, and you invite new people there too.`,
      ],
    })
    drafts.push({
      id: 'welcome',
      target: null,
      placement: 'center',
      title: 'Write a welcome message',
      body: [
        `Everyone who joins sees your welcome message when they first open ${community}. You might ask them to introduce themselves in an Introductions topic, to read the rules, or to say hello in the chat.`,
      ],
    })
  }

  return drafts.map((d, i): TourStep => {
    if (i < drafts.length - 1) return { ...d, primary: 'Next', skip: 'Skip tour' }
    if (d.id === 'welcome') return { ...d, primary: 'Write welcome message', skip: 'Later' }
    return { ...d, primary: 'Done', skip: null }
  })
}
