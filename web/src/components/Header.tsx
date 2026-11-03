import { Box, Hairline, Heading, Row, Stack, Text } from '../ui'

interface HeaderProps {
  username: string | null
}

export function Header({ username }: HeaderProps) {
  return (
    <Box as="header">
      <Stack gap={2}>
        <Row justify="between" align="baseline">
          <Heading level={1}>Sweet</Heading>
          {username && <Text as="span" variant="secondary">{username}</Text>}
        </Row>
        <Hairline />
      </Stack>
    </Box>
  )
}
