interface Tab<K extends string> {
  key: K
  label: string
}

interface TabBarProps<K extends string> {
  tabs: Tab<K>[]
  active: K
  onSelect: (key: K) => void
}

/** Phone navigation: a bar at the bottom of the screen, one tab per pane. */
export function TabBar<K extends string>({ tabs, active, onSelect }: TabBarProps<K>) {
  return (
    <nav className="flex flex-none border-t-2 border-pink bg-card pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-current={t.key === active ? 'page' : undefined}
          className="flex-1 cursor-pointer py-3 font-medium text-mute transition-colors hover:text-ink aria-[current=page]:text-sweet focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink"
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
