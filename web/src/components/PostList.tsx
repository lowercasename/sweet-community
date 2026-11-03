import { Fragment } from 'react'
import type { Post as PostData } from '../api'
import { Hairline, Stack, Text } from '../ui'
import { Post } from './Post'

interface PostListProps {
  posts: PostData[]
}

export function PostList({ posts }: PostListProps) {
  if (posts.length === 0) return <Text variant="secondary">Nothing here yet.</Text>
  return (
    <Stack gap={3}>
      {posts.map((post, i) => (
        <Fragment key={post.id}>
          {i > 0 && <Hairline />}
          <Post post={post} />
        </Fragment>
      ))}
    </Stack>
  )
}
