import { useRelease, useSourceUrl } from '../data/hooks'
import { Colophon, HeartMark, Link } from '../ui'

/**
 * The line at the bottom of Home's feed (Raphael, 2026-11-09): the release, a link to the source code, and who built
 * Sweet. It shows once the version has loaded, so it does not appear in parts.
 */
export function SweetColophon() {
  const release = useRelease()
  const source = useSourceUrl()
  if (!release || !source) return null
  return (
    <Colophon
      lines={[
        [`Sweet ${release}`, <Link href={source}>Source code</Link>],
        [
          <>
            Built with <HeartMark /> by <Link href="https://raphaelkabo.com">Raphael</Link>
          </>,
        ],
      ]}
    />
  )
}
