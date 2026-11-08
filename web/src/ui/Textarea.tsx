interface TextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  maxLength?: number
  rows?: number
  /** Enter (without Shift) calls this instead of inserting a newline. */
  onSubmit?: () => void
  /** Called on Escape. */
  onCancel?: () => void
}

/** A multi-line text input in the editor's style. */
export function Textarea({
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength,
  rows = 2,
  onSubmit,
  onCancel,
}: TextareaProps) {
  return (
    <textarea
      className="w-full resize-none rounded-[4px] border border-input bg-card px-3 py-1.5 text-ink transition-colors placeholder:text-mute focus:border-pink focus:outline-none"
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={maxLength}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
          e.preventDefault()
          onSubmit()
        } else if (e.key === 'Escape' && onCancel) {
          e.preventDefault()
          onCancel()
        }
      }}
    />
  )
}
