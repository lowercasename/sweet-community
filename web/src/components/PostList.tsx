import type { Post as PostData, User } from '../api'
import { Stack, Text } from '../ui'
import { Post } from './Post'

interface PostListProps {
  posts: PostData[]
  me: User
  /** True while offline. */
  disabled: boolean
  onEdit: (id: string, bodyHtml: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function PostList({ posts, me, disabled, onEdit, onDelete }: PostListProps) {
  if (posts.length === 0) return <Text variant="secondary">Nothing here yet. Write the first post.</Text>
  return (
    <Stack gap={3}>
      {posts.map((post) => (
        <Post
          key={post.id}
          post={post}
          me={me}
          disabled={disabled}
          onEdit={(html) => onEdit(post.id, html)}
          onDelete={() => onDelete(post.id)}
        />
      ))}
    </Stack>
  )
}
