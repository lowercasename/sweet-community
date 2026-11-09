import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRoute } from 'wouter'
import type { User } from './api'
import { keys } from './data/keys'
import { useGroups, useMe, useSession, useSettings } from './data/hooks'
import { Home } from './pages/Home'
import { Join } from './pages/Join'
import { Login } from './pages/Login'
import { Setup } from './pages/Setup'
import { SigninLink } from './pages/SigninLink'
import { Verify } from './pages/Verify'
import { Welcome } from './pages/Welcome'

/**
 * The root component. It checks who the user is, and whether they opened a
 * link from an email, an invite link or the setup link. Every page has a URL.
 * The join, sign-in link, verify and setup pages
 * are the pages a signed-out user can see. The owner of a community that has no name
 * yet is kept on the welcome page.
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
  const [linked, linkParams] = useRoute('/signin/:token')

  // Set the browser tab's title to the community's name.
  useEffect(() => {
    document.title = settings?.name || 'Sweet'
  }, [settings?.name])

  const signedIn = (m: User) => {
    signIn(m)
    navigate('/', { replace: true })
  }

  if (isPending) return null
  // A link that confirms a changed address works whether or not the person is signed in, and it signs nobody in.
  if (verifying) {
    return (
      <Verify
        token={decodeURIComponent(verifyParams.token)}
        name={settings?.name}
        signedIn={!!me}
        onConfirmed={() => void qc.invalidateQueries({ queryKey: keys.account })}
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
    if (joining) return <Join code={decodeURIComponent(joinParams.code)} community={settings} onSignedIn={signedIn} />
    if (linked)
      return <SigninLink token={decodeURIComponent(linkParams.token)} name={settings?.name} onSignedIn={signedIn} />
    return <Login community={settings} onSignedIn={signedIn} />
  }
  return <SignedIn me={me} onSignOut={() => void signOut()} />
}

/** The signed-in app. The owner of an unnamed community goes through onboarding first. Every other user sees Home. */
function SignedIn({ me, onSignOut }: { me: User; onSignOut: () => void }) {
  const { settings } = useSettings()
  const { groups } = useGroups()
  const owner = groups.find((g) => g.kind === 'root')?.can.manage_instance === true
  // Once onboarding has started, it runs until its last step (the invite step), even if the name changes meanwhile.
  const [welcoming, setWelcoming] = useState<boolean | null>(null)
  useEffect(() => {
    if (welcoming === null && settings && owner && settings.name === '') setWelcoming(true)
  }, [welcoming, settings, owner])
  if (welcoming && settings) return <Welcome settings={settings} onDone={() => setWelcoming(false)} />
  return <Home me={me} onSignOut={onSignOut} />
}
