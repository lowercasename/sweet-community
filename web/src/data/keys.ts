/** Query keys. People and groups are instance-wide; feeds, rooms and member lists are per group; comments per post; a post page per post. */
/** The root group's fixed id (perm.Root on the server): the instance itself. */
export const ROOT_ID = '00000000-0000-7000-8000-000000000000'

export const keys = {
  me: ['me'] as const,
  users: ['users'] as const,
  groups: ['groups'] as const,
  members: (groupId: string) => ['members', groupId] as const,
  posts: (groupId: string) => ['posts', groupId] as const,
  /** One post, for its page; applyEvent keeps it in step with the feed that holds it. */
  post: (id: string) => ['post', id] as const,
  comments: (postId: string) => ['comments', postId] as const,
  messages: (groupId: string) => ['messages', groupId] as const,
  invites: ['invites'] as const,
  notifications: ['notifications'] as const,
  profile: (name: string) => ['profile', name] as const,
  userPosts: (name: string) => ['userPosts', name] as const,
  markers: ['markers'] as const,
  settings: ['settings'] as const,
}
