// @vitest-environment happy-dom
import { afterEach, describe, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithQuery, user } from '../test-utils'

/**
 * Signing out must reach the component that asked who is signed in. The
 * trap: clearing the cache while an observer is mounted leaves it holding
 * the removed query and its old answer.
 */
vi.mock('../api', () => ({
  getMe: vi.fn(() => Promise.resolve(user('kit'))),
  logout: vi.fn(() => Promise.resolve()),
}))

afterEach(cleanup)

describe('useSession', () => {
  it('signing out tells the signed-in observer that nobody is signed in', async () => {
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
