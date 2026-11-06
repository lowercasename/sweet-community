import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRoute } from 'wouter'
import type { User } from './api'
import { keys } from './data/keys'
import { useMe, useSession } from './data/hooks'
import { Home } from './pages/Home'
import { Join } from './pages/Join'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { ResetRequest } from './pages/ResetRequest'
import { Verify } from './pages/Verify'
import { RESET } from './routes'

/**
 * Root: who is this, and are they here on a link from their mail or an
 * invite? Every page is a URL (architecture.md, Layout); the join, verify
 * and reset pages are the ones a stranger may see.
 */
export function App() {
  const { data: me, isPending } = useMe()
  const { signIn, signOut } = useSession()
  const qc = useQueryClient()
  const [, navigate] = useLocation()
  const [joining, joinParams] = useRoute('/join/:code')
  const [verifying, verifyParams] = useRoute('/verify/:token')
  const [resetting] = useRoute(RESET)
  const [resettingWith, resetParams] = useRoute(`${RESET}/:token`)

  const signedIn = (m: User) => {
    signIn(m)
    navigate('/', { replace: true })
  }

  if (isPending) return null
  // A verification link works signed in too: that is how a changed address takes effect.
  if (verifying) {
    return (
      <Verify
        token={decodeURIComponent(verifyParams.token)}
        onVerified={(m) => {
          signIn(m)
          void qc.invalidateQueries({ queryKey: keys.account })
          navigate(me ? '/settings' : '/', { replace: true })
        }}
      />
    )
  }
  if (!me) {
    if (joining) return <Join code={decodeURIComponent(joinParams.code)} />
    if (resettingWith) return <ResetPassword token={decodeURIComponent(resetParams.token)} onReset={signedIn} />
    if (resetting) return <ResetRequest />
    return <Login onSignedIn={signedIn} />
  }
  return <Home me={me} onSignOut={() => void signOut()} />
}
