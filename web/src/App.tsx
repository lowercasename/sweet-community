import { useEffect, useState } from 'react'
import { getMe, type User } from './api'
import { Home } from './pages/Home'
import { Join } from './pages/Join'
import { Login } from './pages/Login'

type Auth = { kind: 'loading' } | { kind: 'anonymous' } | { kind: 'signed-in'; me: User }

/** The join page's code, if this is an invite link. */
function joinCode(): string | null {
  const m = /^\/join\/([^/]+)/.exec(window.location.pathname)
  return m ? decodeURIComponent(m[1]) : null
}

/** Root: who is this, and are they here on an invite link? */
export function App() {
  const [auth, setAuth] = useState<Auth>({ kind: 'loading' })
  const [code] = useState(joinCode)

  useEffect(() => {
    getMe()
      .then((me) => setAuth({ kind: 'signed-in', me }))
      .catch(() => setAuth({ kind: 'anonymous' }))
  }, [])

  const signedIn = (me: User) => {
    if (code) window.history.replaceState(null, '', '/')
    setAuth({ kind: 'signed-in', me })
  }

  if (auth.kind === 'loading') return null
  if (auth.kind === 'anonymous') {
    return code ? <Join code={code} onJoined={signedIn} /> : <Login onSignedIn={signedIn} />
  }
  return <Home me={auth.me} onSignOut={() => setAuth({ kind: 'anonymous' })} />
}
