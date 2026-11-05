import { useLocation, useRoute } from 'wouter'
import type { User } from './api'
import { useMe, useSession } from './data/hooks'
import { Home } from './pages/Home'
import { Join } from './pages/Join'
import { Login } from './pages/Login'

/**
 * Root: who is this, and are they here on an invite link? Every page is a
 * URL (architecture.md, Layout); the join page is the one a stranger may see.
 */
export function App() {
  const { data: me, isPending } = useMe()
  const { signIn, signOut } = useSession()
  const [, navigate] = useLocation()
  const [joining, params] = useRoute('/join/:code')

  const signedIn = (m: User) => {
    signIn(m)
    if (joining) navigate('/', { replace: true })
  }

  if (isPending) return null
  if (!me) {
    return joining ? (
      <Join code={decodeURIComponent(params.code)} onJoined={signedIn} />
    ) : (
      <Login onSignedIn={signedIn} />
    )
  }
  return <Home me={me} onSignOut={() => void signOut()} />
}
