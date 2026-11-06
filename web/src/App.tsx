import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRoute } from 'wouter'
import type { User } from './api'
import { keys } from './data/keys'
import { useGroups, useMe, useSession, useSettings } from './data/hooks'
import { Home } from './pages/Home'
import { Join } from './pages/Join'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { ResetRequest } from './pages/ResetRequest'
import { Setup } from './pages/Setup'
import { Verify } from './pages/Verify'
import { Welcome } from './pages/Welcome'
import { RESET } from './routes'

/**
 * Root: who is this, and are they here on a link from their mail, an
 * invite, or the setup link? Every page is a URL (architecture.md, Layout);
 * the join, verify, reset and setup pages are the ones a stranger may see.
 * The owner of a community with no name yet is kept on the welcome page.
 */
export function App() {
  const { data: me, isPending } = useMe()
  const { settings } = useSettings()
  const { signIn, signOut } = useSession()
  const qc = useQueryClient()
  const [, navigate] = useLocation()
  const [joining, joinParams] = useRoute('/join/:code')
  const [verifying, verifyParams] = useRoute('/verify/:token')
  const [settingUp, setupParams] = useRoute('/setup/:token')
  const [resetting] = useRoute(RESET)
  const [resettingWith, resetParams] = useRoute(`${RESET}/:token`)

  // The tab is named after the community.
  useEffect(() => {
    document.title = settings?.name || 'Sweet'
  }, [settings?.name])

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
        name={settings?.name}
        onVerified={(m) => {
          signIn(m)
          void qc.invalidateQueries({ queryKey: keys.account })
          navigate(me ? '/settings' : '/', { replace: true })
        }}
      />
    )
  }
  if (!me) {
    if (settingUp && settings && !settings.owner_set) {
      return (
        <Setup
          token={decodeURIComponent(setupParams.token)}
          onSetUp={(m) => {
            void qc.invalidateQueries({ queryKey: keys.settings })
            signedIn(m)
          }}
        />
      )
    }
    if (joining) return <Join code={decodeURIComponent(joinParams.code)} community={settings} />
    if (resettingWith)
      return <ResetPassword token={decodeURIComponent(resetParams.token)} name={settings?.name} onReset={signedIn} />
    if (resetting) return <ResetRequest name={settings?.name} />
    return <Login community={settings} onSignedIn={signedIn} />
  }
  return <SignedIn me={me} onSignOut={() => void signOut()} />
}

/** Signed in: the owner of an unnamed community goes through onboarding first; everyone else, Home. */
function SignedIn({ me, onSignOut }: { me: User; onSignOut: () => void }) {
  const { settings } = useSettings()
  const { groups } = useGroups()
  const owner = groups.find((g) => g.kind === 'root')?.can.manage_instance === true
  // Onboarding runs to its own end (the invite step) once begun, whatever the name becomes meanwhile.
  const [welcoming, setWelcoming] = useState<boolean | null>(null)
  useEffect(() => {
    if (welcoming === null && settings && owner && settings.name === '') setWelcoming(true)
  }, [welcoming, settings, owner])
  if (welcoming && settings) return <Welcome settings={settings} onDone={() => setWelcoming(false)} />
  return <Home me={me} onSignOut={onSignOut} />
}
