// @vitest-environment happy-dom
import { afterEach, describe, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithQuery, user } from '../test-utils'

/**
 * Signing out must update the component that queried the signed-in user.
 * Clearing the cache while an observer is mounted leaves the observer holding
 * the removed query and its old data.
 */
vi.mock('../api', () => ({
  getMe: vi.fn(() => Promise.resolve(user('kit'))),
  logout: vi.fn(() => Promise.resolve()),
}))

afterEach(cleanup)

describe('useSession', () => {
  it('signing out updates the observer of the signed-in user to null', async () => {
    const { useMe, useSession } = await import('./hooks')
    function Who() {
      const { data: me, isPending } = useMe()
      const { signOut } = useSession()
      if (isPending) return <p>loading</p>
      return me ? <button onClick={() => void signOut()}>out {me.username}</button> : <p>anonymous</p>
    }
    renderWithQuery(<Who />)
    fireEvent.click(await screen.findByRole('button', { name: 'out kit' }))
    await screen.findByText('anonymous')
  })
})
