/** Query keys. People and groups are instance-wide; feeds, rooms and member lists are per group; comments per post. */
/** The root group's fixed id (perm.Root on the server): the instance itself. */
export const ROOT_ID = '00000000-0000-7000-8000-000000000000'

export const keys = {
  me: ['me'] as const,
  users: ['users'] as const,
  groups: ['groups'] as const,
  members: (groupId: string) => ['members', groupId] as const,
  posts: (groupId: string) => ['posts', groupId] as const,
  comments: (postId: string) => ['comments', postId] as const,
  messages: (groupId: string) => ['messages', groupId] as const,
  invites: ['invites'] as const,
  settings: ['settings'] as const,
}
