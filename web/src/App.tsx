import { useState } from 'react'
import type { User } from './api'
import { useMe, useSession } from './data/hooks'
import { Home } from './pages/Home'
import { Join } from './pages/Join'
import { Login } from './pages/Login'

/** The join page's code, if this is an invite link. */
function joinCode(): string | null {
  const m = /^\/join\/([^/]+)/.exec(window.location.pathname)
  return m ? decodeURIComponent(m[1]) : null
}

/** Root: who is this, and are they here on an invite link? */
export function App() {
  const { data: me, isPending } = useMe()
  const { signIn, signOut } = useSession()
  const [code] = useState(joinCode)

  const signedIn = (m: User) => {
    if (code) window.history.replaceState(null, '', '/')
    signIn(m)
  }

  if (isPending) return null
  if (!me) return code ? <Join code={code} onJoined={signedIn} /> : <Login onSignedIn={signedIn} />
  return <Home me={me} onSignOut={() => void signOut()} />
}
