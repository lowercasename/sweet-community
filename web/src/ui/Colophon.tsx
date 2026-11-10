import { Fragment, type ReactNode } from 'react'

/**
 * A small grey line at the end of a page, centred, such as the release and the links at the bottom of Home's feed.
 * The items are shown with a middle dot between them.
 */
export function Colophon({ items }: { items: ReactNode[] }) {
  return (
    <footer className="pt-4 pb-2 text-center text-sm text-mute">
      <p className="m-0">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden> · </span>}
            {item}
          </Fragment>
        ))}
      </p>
    </footer>
  )
}
