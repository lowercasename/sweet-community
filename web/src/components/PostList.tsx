import type { Post as PostData } from '../api'
import { Alert, Stack } from '../ui'
import { Post } from './Post'

interface PostListProps {
  posts: PostData[]
  /** True while offline. */
  disabled: boolean
  onEdit: (id: string, bodyHtml: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSetTopic?: (id: string, topicId: string | null) => Promise<void>
}

export function PostList({ posts, disabled, onEdit, onDelete, onSetTopic }: PostListProps) {
  if (posts.length === 0) return <Alert>Nothing here yet. Write the first post.</Alert>
  return (
    <Stack gap={3}>
      {posts.map((post) => (
        <Post
          key={post.id}
          post={post}
          disabled={disabled}
          onEdit={(html) => onEdit(post.id, html)}
          onDelete={() => onDelete(post.id)}
          onSetTopic={onSetTopic && ((topicId) => onSetTopic(post.id, topicId))}
        />
      ))}
    </Stack>
  )
}
