/** Query keys. Users and groups are instance-wide. Feeds, chats and member lists are per group. Comments are per post. A post page is per post. */
/** The root group's fixed id (perm.Root on the server). The root group is the instance itself. */
export const ROOT_ID = '00000000-0000-7000-8000-000000000000'

export const keys = {
  me: ['me'] as const,
  users: ['users'] as const,
  groups: ['groups'] as const,
  members: (groupId: string) => ['members', groupId] as const,
  /** A feed, or the community's feed filtered to one topic. The group's key prefix matches both. */
  posts: (groupId: string, topicId?: string | null) =>
    topicId ? (['posts', groupId, topicId] as const) : (['posts', groupId] as const),
  topics: ['topics'] as const,
  /** One post, for its page. applyEvent keeps it in sync with the feed that contains it. */
  post: (id: string) => ['post', id] as const,
  comments: (postId: string) => ['comments', postId] as const,
  messages: (groupId: string) => ['messages', groupId] as const,
  invites: ['invites'] as const,
  notifications: ['notifications'] as const,
  profile: (name: string) => ['profile', name] as const,
  userPosts: (name: string) => ['userPosts', name] as const,
  search: (q: string) => ['search', q] as const,
  markers: ['markers'] as const,
  settings: ['settings'] as const,
  account: ['account'] as const,
  mySettings: ['mySettings'] as const,
  version: ['version'] as const,
  rules: ['rules'] as const,
  reports: ['reports'] as const,
}
