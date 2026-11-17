import type { Group, Post as PostData } from '../api'
import { Alert, Stack } from '../ui'
import { Post } from './Post'

interface PostListProps {
  posts: PostData[]
  /** True while offline. */
  disabled: boolean
  onEdit: (id: string, bodyHtml: string, groupId?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  places?: Group[]
}

export function PostList({ posts, disabled, onEdit, onDelete, places }: PostListProps) {
  if (posts.length === 0) return <Alert>Nothing here yet. Write the first post.</Alert>
  return (
    <Stack gap={3}>
      {posts.map((post) => (
        <Post
          key={post.id}
          post={post}
          disabled={disabled}
          onEdit={(html, destination) => onEdit(post.id, html, destination)}
          onDelete={() => onDelete(post.id)}
          place={places?.find((g) => g.id === post.group_id && g.kind === 'group')}
        />
      ))}
    </Stack>
  )
}
