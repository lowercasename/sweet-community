import { expect, it } from 'vitest'
import { group, ROOT } from '../test-utils'
import { postDestinations } from './groups'

it('offers destinations with posts while retaining an existing post’s current room for editing', () => {
  const groups = [
    group(ROOT, 'owner'),
    group('posts', 'member', { visibility: 'open', mode: 'posts' }),
    group('chat', 'member', { visibility: 'open', mode: 'chat' }),
    group('private', 'member'),
  ]
  expect(postDestinations(groups).map((g) => g.id)).toEqual([ROOT, 'posts'])
  expect(postDestinations(groups, 'chat').map((g) => g.id)).toEqual([ROOT, 'posts', 'chat'])
})
