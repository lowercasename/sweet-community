import type { Post as PostData, User } from '../api'
import { Stack, Text } from '../ui'
import { Post } from './Post'

interface PostListProps {
  posts: PostData[]
  /** The viewer, once known; decides which posts show Edit. */
  me: User | null
  /** True while offline. */
  disabled: boolean
  onEdit: (id: string, bodyHtml: string) => Promise<void>
}

export function PostList({ posts, me, disabled, onEdit }: PostListProps) {
  if (posts.length === 0) return <Text variant="secondary">Nothing here yet. Write the first post.</Text>
  return (
    <Stack gap={3}>
      {posts.map((post) => (
        <Post
          key={post.id}
          post={post}
          canEdit={me != null && post.author.id === me.id}
          disabled={disabled}
          onEdit={(html) => onEdit(post.id, html)}
        />
      ))}
    </Stack>
  )
}
