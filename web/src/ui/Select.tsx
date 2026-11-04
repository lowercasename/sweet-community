interface SelectProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  /** Accessible name when there is no visible label around it. */
  label?: string
  disabled?: boolean
}

/** The browser's own select, in the editor's style. */
export function Select<T extends string>({ value, options, onChange, label, disabled }: SelectProps<T>) {
  return (
    <select
      className="rounded-[4px] border border-line bg-card px-3 py-1.5 text-ink transition-colors focus:border-pink focus:outline-none disabled:text-mute"
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
