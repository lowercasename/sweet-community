interface InputProps {
  type?: 'text' | 'password' | 'url' | 'email'
  name?: string
  value: string
  onChange?: (value: string) => void
  autoComplete?: string
  autoFocus?: boolean
  required?: boolean
  readOnly?: boolean
  /** Select everything on focus; for copyable values. */
  selectOnFocus?: boolean
  /** Its name when no Field labels it (a search box). */
  label?: string
  placeholder?: string
}

/** A single-line text input in the editor's style. */
export function Input({
  type = 'text',
  name,
  value,
  onChange,
  autoComplete,
  autoFocus,
  required,
  readOnly,
  selectOnFocus,
  label,
  placeholder,
}: InputProps) {
  return (
    <input
      className="w-full rounded-[4px] border border-line bg-card px-3 py-1.5 text-ink transition-colors read-only:text-mute focus:border-pink focus:outline-none"
      type={type}
      name={name}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onFocus={selectOnFocus ? (e) => e.target.select() : undefined}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      required={required}
      readOnly={readOnly}
      aria-label={label}
      placeholder={placeholder}
      spellCheck={false}
    />
  )
}
