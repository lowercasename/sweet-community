import { Icon, type IconName } from './Icon'
import { Dotted } from './Dotted'

interface Tab<K extends string> {
  key: K
  icon: IconName
  label: string
  /** Whether the tab has unread content. Shows a dot, never a count. */
  dot?: boolean
  /** Names this element for the welcome tour, which points at it (src/tour/steps.ts). */
  tour?: string
}

interface TabBarProps<K extends string> {
  tabs: Tab<K>[]
  /** The tab for the pane being viewed, if any. */
  active?: K
  onSelect: (key: K) => void
}

/** Phone navigation. A bar at the bottom of the screen with an icon and a short label per item. */
export function TabBar<K extends string>({ tabs, active, onSelect }: TabBarProps<K>) {
  return (
    <nav aria-label="Main" className="flex flex-none border-t-2 border-pink bg-card pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-current={t.key === active ? 'page' : undefined}
          data-tour={t.tour}
          aria-label={t.dot ? `${t.label}, unread` : undefined}
          className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium text-mute transition-colors hover:text-ink aria-[current=page]:text-sweet focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink"
          onClick={() => onSelect(t.key)}
        >
          <Dotted shown={t.dot === true}>
            <Icon name={t.icon} size={22} />
          </Dotted>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
