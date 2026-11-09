import { Fragment, type ReactNode } from 'react'

/**
 * Small grey lines at the end of a page, centred, such as the release and the source code link at the bottom of
 * Home's feed. Each line is a list of items, shown with a middle dot between them.
 */
export function Colophon({ lines }: { lines: ReactNode[][] }) {
  return (
    <footer className="flex flex-col items-center gap-1 pt-4 pb-2 text-center text-sm text-mute">
      {lines.map((items, i) => (
        <p key={i} className="m-0">
          {items.map((item, j) => (
            <Fragment key={j}>
              {j > 0 && <span aria-hidden> · </span>}
              {item}
            </Fragment>
          ))}
        </p>
      ))}
    </footer>
  )
}
