import { useRelease, useSourceUrl } from '../data/hooks'
import { Colophon, Link } from '../ui'

/** Sweet's website. */
const ABOUT_URL = 'https://sweet.community'

/**
 * The line at the bottom of Home's feed: the release, a link to Sweet's website and a link to the source code. It
 * shows once the version has loaded, so it does not appear in parts.
 */
export function SweetColophon() {
  const release = useRelease()
  const source = useSourceUrl()
  if (!release || !source) return null
  return (
    <Colophon
      items={[`Sweet ${release}`, <Link href={ABOUT_URL}>About</Link>, <Link href={source}>Source code</Link>]}
    />
  )
}
