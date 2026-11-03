import type { Post as PostData } from '../api'
import { Box, HtmlContent, Row, Stack, Text, Time } from '../ui'

interface PostProps {
  post: PostData
}

export function Post({ post }: PostProps) {
  return (
    <Box as="article">
      <Stack gap={1}>
        <Row gap={2} align="baseline">
          <Text as="span" weight="bold">{post.author.username}</Text>
          <Time at={post.created_at} />
        </Row>
        <HtmlContent html={post.body_html} />
      </Stack>
    </Box>
  )
}
