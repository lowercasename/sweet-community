// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/** The join page shows the community. Who invited the visitor, to which community, and what it is for. */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getInvite: vi.fn(() => Promise.resolve({ invited_by: 'raphael' })),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('Join', () => {
  it('names the community and says what it is for', async () => {
    const { Join } = await import('./Join')
    render(
      <Join
        code="abc"
        community={{
          group_creation: 'anyone',
          name: 'Knitting Circle',
          description: 'Wool and gossip.',
          owner_set: true,
        }}
      />,
    )
    await screen.findByText('raphael invited you to Knitting Circle.')
    expect(screen.getByText('Wool and gossip.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Join Knitting Circle' })).toBeTruthy()
    expect(screen.getAllByText('Knitting Circle').length).toBeGreaterThan(0)
    expect(screen.getByText('Made with Sweet')).toBeTruthy()
  })
})
