import { describe, expect, it } from 'vitest'
import { tourSteps, type TourContext } from './steps'

/**
 * The welcome tour's steps (docs/tour-script.md). Which steps a user gets depends on the width, on whether they are
 * the owner, and on the community: its topics, its rules, and who may create rooms.
 */
const member: TourContext = {
  community: 'Knitting Circle',
  phone: false,
  owner: false,
  canCreateRooms: true,
  topic: 'Introductions',
  hasRules: true,
}
const ids = (c: TourContext) => tourSteps(c).map((s) => s.id)

describe('tourSteps', () => {
  it('gives a member on a desktop every step that applies, ending with the rules', () => {
    expect(ids(member)).toEqual(['posts', 'chat', 'divider', 'topics', 'rooms', 'conversations', 'rules'])
  })

  it('leaves out the divider on a phone, which shows one column at a time', () => {
    expect(ids({ ...member, phone: true })).toEqual(['posts', 'chat', 'topics', 'rooms', 'conversations', 'rules'])
  })

  it('leaves out topics, rooms and rules when they do not apply', () => {
    expect(ids({ ...member, topic: undefined, canCreateRooms: false, hasRules: false })).toEqual([
      'posts',
      'chat',
      'divider',
      'conversations',
    ])
  })

  it('gives the owner the Community page and the welcome message in place of the rules', () => {
    expect(ids({ ...member, owner: true })).toEqual([
      'posts',
      'chat',
      'divider',
      'topics',
      'rooms',
      'conversations',
      'community',
      'welcome',
    ])
  })

  it('points at the columns on a desktop and at the bar and the Menu tab on a phone', () => {
    const at = (c: TourContext) => Object.fromEntries(tourSteps(c).map((s) => [s.id, s.target]))
    expect(at({ ...member, owner: true })).toEqual({
      posts: 'posts',
      chat: 'chat',
      divider: 'divider',
      topics: 'topics',
      rooms: 'rooms',
      conversations: 'conversations',
      community: 'community',
      welcome: null,
    })
    expect(at({ ...member, phone: true })).toEqual({
      posts: 'view-posts',
      chat: 'view-chat',
      topics: 'topics',
      rooms: 'menu',
      conversations: 'menu',
      rules: 'menu',
    })
  })

  it("uses the script's words, with the community's name and a topic in them", () => {
    const steps = tourSteps(member)
    const step = (id: string) => steps.find((s) => s.id === id)!
    expect(step('posts').title).toBe('Posts')
    expect(step('posts').body).toEqual([
      'This column is for posts. A post is a longer, lasting piece of writing that people can comment on.',
    ])
    expect(step('chat').body[0]).toBe(
      'This column is the chat. Everyone in Knitting Circle can read and write in it. Use it for quick messages.',
    )
    expect(step('divider').title).toBe('Resize the columns')
    expect(step('topics').body[0]).toMatch(/^A post can have a topic, such as Introductions\. /)
    expect(step('rooms').body[0]).toContain('You could make one to bring together a few people who share an interest.')
    expect(step('rules').body).toEqual([
      "You agreed to Knitting Circle's rules when you joined. You can read them again here.",
    ])
    const phone = tourSteps({ ...member, phone: true })
    expect(phone.find((s) => s.id === 'chat')!.body[0]).toMatch(
      /^Tap here to switch to the chat\. .* switches back to posts\.$/,
    )
    expect(phone.find((s) => s.id === 'rules')!.body[0]).toMatch(/You can read them again in the Menu\.$/)
  })

  it("has the owner's own words for rooms, and two paragraphs for the Community page", () => {
    const steps = tourSteps({ ...member, owner: true, phone: true })
    expect(steps.find((s) => s.id === 'rooms')!.body[0]).toContain(
      'You could make one for you and the moderators who help you run Knitting Circle, or for a few people who share an interest.',
    )
    const community = steps.find((s) => s.id === 'community')!
    expect(community.title).toBe('Running Knitting Circle')
    expect(community.body).toHaveLength(2)
    expect(community.body[0]).toMatch(/^The Community page is in the Menu\. The Community page is where you look after/)
  })

  it('has Next and Skip tour on every card but the last, which has Done, or for the owner Later and Write welcome message', () => {
    const steps = tourSteps(member)
    expect(steps.slice(0, -1).every((s) => s.primary === 'Next' && s.skip === 'Skip tour')).toBe(true)
    expect(steps.at(-1)).toMatchObject({ primary: 'Done', skip: null })
    const owner = tourSteps({ ...member, owner: true })
    expect(owner.at(-1)).toMatchObject({ id: 'welcome', primary: 'Write welcome message', skip: 'Later', target: null })
  })
})
