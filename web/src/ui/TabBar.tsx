import { Icon, type IconName } from './Icon'
import { UnreadDot } from './NavItem'

interface Tab<K extends string> {
  key: K
  icon: IconName
  label: string
  /** Something unread behind it: a dot, never a count. */
  dot?: boolean
}

interface TabBarProps<K extends string> {
  tabs: Tab<K>[]
  /** The tab for the pane being viewed, if any. */
  active?: K
  onSelect: (key: K) => void
}

/** Phone navigation: a bar at the bottom of the screen, an icon and a short label per item. */
export function TabBar<K extends string>({ tabs, active, onSelect }: TabBarProps<K>) {
  return (
    <nav aria-label="Main" className="flex flex-none border-t-2 border-pink bg-card pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-current={t.key === active ? 'page' : undefined}
          aria-label={t.dot ? `${t.label}, unread` : undefined}
          className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium text-mute transition-colors hover:text-ink aria-[current=page]:text-sweet focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink"
          onClick={() => onSelect(t.key)}
        >
          <span className="relative flex">
            <Icon name={t.icon} size={22} />
            {t.dot && <UnreadDot />}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
